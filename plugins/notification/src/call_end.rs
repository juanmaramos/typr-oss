use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};

use tauri::Manager;
use tauri_plugin_listener::{ListenerPluginExt, PipelineStatus, PipelineStatusPhase};
use typr_detect::{CallPresence, CallSource};

const END_GRACE: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
pub struct CallCandidate {
    pub id: String,
    pub label: String,
}

impl From<&CallSource> for CallCandidate {
    fn from(source: &CallSource) -> Self {
        Self {
            id: source.id.clone(),
            label: source.label.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CallEndStatus {
    Off,
    PermissionRequired,
    Idle,
    AssociationRequired {
        session_id: String,
        candidates: Vec<CallCandidate>,
    },
    Monitoring {
        session_id: String,
        source: CallCandidate,
    },
    Uncertain {
        session_id: String,
        source: CallCandidate,
    },
    Countdown {
        session_id: String,
        source: CallCandidate,
        remaining_seconds: u32,
    },
}

struct PendingStop {
    session_id: String,
    run_token: String,
    permit: Arc<AtomicBool>,
}

#[derive(Default)]
struct Controller {
    enabled: bool,
    permission_granted: bool,
    session_id: Option<String>,
    run_token: Option<String>,
    independent: bool,
    candidates: Vec<CallCandidate>,
    source: Option<CallCandidate>,
    presence: Option<CallPresence>,
    deadline: Option<Instant>,
    stop_requested: bool,
    automatic_stop_requested: bool,
    permit: Arc<AtomicBool>,
}

impl Controller {
    fn set_permission(&mut self, granted: bool) {
        if !granted {
            // Losing permission is uncertainty, including a stop queued on the
            // listener lock. Keep the bound source so granting access recovers it.
            self.observe(Vec::new(), CallPresence::Unknown, Instant::now());
        }
        self.permission_granted = granted;
    }

    fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
        self.sync_session(None, None);
    }

    fn sync_session(&mut self, session_id: Option<String>, run_token: Option<String>) -> bool {
        if self.session_id == session_id && self.run_token == run_token && self.enabled {
            return false;
        }
        self.permit.store(false, Ordering::SeqCst);
        self.session_id = session_id;
        self.run_token = run_token;
        self.independent = false;
        self.candidates.clear();
        self.source = None;
        self.presence = None;
        self.deadline = None;
        self.stop_requested = false;
        self.automatic_stop_requested = false;
        true
    }

    fn associate(&mut self, session_id: &str, source_id: Option<&str>) -> Result<(), String> {
        if !self.enabled || self.session_id.as_deref() != Some(session_id) {
            return Err("Recording is no longer available for call association".to_string());
        }
        let source = match source_id {
            Some(id) => Some(
                self.candidates
                    .iter()
                    .find(|source| source.id == id)
                    .cloned()
                    .ok_or("Call is no longer available for association")?,
            ),
            None => None,
        };
        self.permit.store(false, Ordering::SeqCst);
        self.independent = source.is_none();
        self.permit = Arc::new(AtomicBool::new(source.is_some()));
        self.source = source;
        self.presence = Some(CallPresence::Active);
        self.deadline = None;
        self.stop_requested = false;
        self.automatic_stop_requested = false;
        Ok(())
    }

    fn observe(
        &mut self,
        candidates: Vec<CallCandidate>,
        presence: CallPresence,
        now: Instant,
    ) -> Option<PendingStop> {
        self.candidates = if self.permission_granted { candidates } else { Vec::new() };
        if !self.enabled || !self.permission_granted || self.independent || self.source.is_none() {
            return None;
        }
        self.presence = Some(presence);
        match presence {
            CallPresence::Active | CallPresence::Unknown => {
                self.deadline = None;
                if self.automatic_stop_requested {
                    self.permit.store(false, Ordering::SeqCst);
                    self.permit = Arc::new(AtomicBool::new(true));
                    self.stop_requested = false;
                    self.automatic_stop_requested = false;
                }
            }
            CallPresence::Ended if !self.stop_requested => {
                let deadline = *self.deadline.get_or_insert(now + END_GRACE);
                if now >= deadline {
                    return self.request_stop(true);
                }
            }
            CallPresence::Ended => {}
        }
        None
    }

    fn request_stop(&mut self, automatic: bool) -> Option<PendingStop> {
        if !self.enabled || (automatic && !self.permission_granted)
            || self.source.is_none() || self.stop_requested || self.independent {
            return None;
        }
        let pending = PendingStop {
            session_id: self.session_id.clone()?,
            run_token: self.run_token.clone()?,
            permit: self.permit.clone(),
        };
        self.stop_requested = true;
        self.automatic_stop_requested = automatic;
        Some(pending)
    }

    fn status(&self, now: Instant) -> CallEndStatus {
        if !self.enabled {
            return CallEndStatus::Off;
        }
        if !self.permission_granted {
            return CallEndStatus::PermissionRequired;
        }
        let Some(session_id) = self.session_id.clone() else {
            return CallEndStatus::Idle;
        };
        if self.independent {
            return CallEndStatus::Idle;
        }
        let Some(source) = self.source.clone() else {
            return if self.candidates.is_empty() {
                CallEndStatus::Idle
            } else {
                CallEndStatus::AssociationRequired {
                    session_id,
                    candidates: self.candidates.clone(),
                }
            };
        };
        if self.stop_requested {
            return CallEndStatus::Countdown {
                session_id,
                source,
                remaining_seconds: 0,
            };
        }
        if let Some(deadline) = self.deadline {
            let remaining = deadline.saturating_duration_since(now);
            return CallEndStatus::Countdown {
                session_id,
                source,
                remaining_seconds: remaining
                    .as_secs()
                    .saturating_add(u64::from(remaining.subsec_nanos() > 0))
                    as u32,
            };
        }
        match self.presence {
            Some(CallPresence::Unknown) | None => CallEndStatus::Uncertain { session_id, source },
            _ => CallEndStatus::Monitoring { session_id, source },
        }
    }
}

#[derive(Default)]
pub(crate) struct Service {
    controller: Controller,
    sources: Vec<CallSource>,
    bound_source: Option<CallSource>,
    revision: u64,
}

impl Service {
    fn sync_recording(&mut self, pipeline: PipelineStatus) -> bool {
        let live = matches!(
            pipeline.phase,
            PipelineStatusPhase::Active
                | PipelineStatusPhase::Paused
                | PipelineStatusPhase::Reconnecting
        );
        let (session_id, run_token) = if live && pipeline.started_at.is_some() {
            (pipeline.session_id, pipeline.started_at)
        } else {
            (None, None)
        };
        if !self.controller.sync_session(session_id, run_token) {
            return false;
        }
        self.bound_source = None;
        self.sources.clear();
        self.revision = self.revision.wrapping_add(1);
        true
    }
}

pub(crate) type SharedCallEnd = tokio::sync::Mutex<Service>;

pub(crate) fn start<R: tauri::Runtime>(app: tauri::AppHandle<R>, enabled: bool) {
    let mut service = Service::default();
    service.controller.enabled = enabled;
    if enabled {
        service.controller.set_permission(typr_detect::call_detection_permission_granted());
    }
    app.manage(SharedCallEnd::new(service));
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            tick(&app).await;
        }
    });
}

async fn tick<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let state = app.state::<SharedCallEnd>();
    if !state.lock().await.controller.enabled
        || app
            .try_state::<tauri_plugin_listener::SharedState>()
            .is_none()
    {
        return;
    }
    let granted = typr_detect::call_detection_permission_granted();
    state.lock().await.controller.set_permission(granted);
    if !granted {
        return;
    }
    // Continue reading call evidence while a stop waits for the listener lock;
    // a rejoin/unknown observation must still be able to revoke its permit.
    let pending_automatic_stop = state.lock().await.controller.automatic_stop_requested;
    if !pending_automatic_stop {
        let pipeline = app.get_pipeline_status().await;
        state.lock().await.sync_recording(pipeline);
    }
    let (revision, bound) = {
        let service = state.lock().await;
        if service.controller.session_id.is_none()
            || !service.controller.enabled
            || service.controller.independent
        {
            return;
        }
        (service.revision, service.bound_source.clone())
    };
    let scan = tokio::task::spawn_blocking(move || typr_detect::scan_calls(bound.as_ref())).await;
    let latest_pipeline = if pending_automatic_stop {
        None
    } else {
        Some(app.get_pipeline_status().await)
    };
    let stop = {
        let mut service = state.lock().await;
        if revision != service.revision || !service.controller.enabled {
            return;
        }
        let granted = typr_detect::call_detection_permission_granted();
        service.controller.set_permission(granted);
        if !granted {
            return;
        }
        if latest_pipeline.is_some_and(|pipeline| service.sync_recording(pipeline)) {
            return;
        }
        let (sources, presence) = match scan {
            Ok(scan) => (scan.candidates, scan.bound_presence),
            Err(error) => {
                tracing::warn!(%error, "call detection task failed");
                (Vec::new(), CallPresence::Unknown)
            }
        };
        let candidates = sources.iter().map(CallCandidate::from).collect();
        service.sources = sources;
        service
            .controller
            .observe(candidates, presence, Instant::now())
    };
    if let Some(stop) = stop {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            app.stop_session_if_matching(&stop.session_id, &stop.run_token, stop.permit.clone())
                .await;
            let state = app.state::<SharedCallEnd>();
            let mut service = state.lock().await;
            if Arc::ptr_eq(&service.controller.permit, &stop.permit) {
                service.controller.stop_requested = false;
                service.controller.automatic_stop_requested = false;
            }
        });
    }
}

pub(crate) async fn enabled<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    app.state::<SharedCallEnd>().lock().await.controller.enabled
}

pub(crate) async fn set_enabled<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    enabled: bool,
) -> Result<(), String> {
    use crate::NotificationPluginExt;
    let state = app.state::<SharedCallEnd>();
    let mut service = state.lock().await;
    // Serialize persisted settings with runtime changes. A kill switch revokes
    // outstanding stop permits before any persistence work.
    if !enabled {
        service.controller.set_enabled(false);
        service.bound_source = None;
        service.sources.clear();
        service.revision = service.revision.wrapping_add(1);
    }
    app.notification_store()
        .set(crate::StoreKey::CallEndEnabled, enabled)
        .map_err(|error| error.to_string())?;
    if enabled {
        service.controller.set_enabled(true);
        service.bound_source = None;
        service.sources.clear();
        service.revision = service.revision.wrapping_add(1);
    }
    Ok(())
}

pub(crate) async fn status<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> CallEndStatus {
    let state = app.state::<SharedCallEnd>();
    let mut service = state.lock().await;
    if service.controller.enabled {
        service.controller.set_permission(typr_detect::call_detection_permission_granted());
    }
    service.controller.status(Instant::now())
}

pub(crate) async fn associate<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    session_id: &str,
    source_id: Option<String>,
) -> Result<(), String> {
    let state = app.state::<SharedCallEnd>();
    let mut service = state.lock().await;
    let source = match &source_id {
        Some(id) => Some(
            service
                .sources
                .iter()
                .find(|source| &source.id == id)
                .cloned()
                .ok_or("Call is no longer available for association")?,
        ),
        None => None,
    };
    service
        .controller
        .associate(session_id, source_id.as_deref())?;
    service.bound_source = source;
    service.revision = service.revision.wrapping_add(1);
    Ok(())
}

pub(crate) async fn stop<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    session_id: &str,
) -> Result<(), String> {
    let pending = {
        let state = app.state::<SharedCallEnd>();
        let mut service = state.lock().await;
        if service.controller.session_id.as_deref() != Some(session_id) {
            return Err("Recording is no longer available".to_string());
        }
        service
            .controller
            .request_stop(false)
            .ok_or("Recording is not associated with a call")?
    };
    app.stop_session_if_matching(&pending.session_id, &pending.run_token, pending.permit)
        .await;
    Ok(())
}

pub(crate) async fn show_notification<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    session_id: &str,
    title: String,
    message: String,
) -> Result<(), String> {
    if title.chars().count() > 120 || message.chars().count() > 500 {
        return Err("Call notification exceeds the permitted length".to_string());
    }
    let session_id = uuid::Uuid::parse_str(session_id)
        .map_err(|_| "Invalid call notification session")?
        .to_string();
    match status(app).await {
        CallEndStatus::AssociationRequired {
            session_id: current,
            ..
        }
        | CallEndStatus::Uncertain {
            session_id: current,
            ..
        }
        | CallEndStatus::Countdown {
            session_id: current,
            ..
        } if current == session_id => {}
        _ => return Err("Call notification is no longer relevant".to_string()),
    }
    let scheme =
        crate::ext::first_deep_link_scheme(app).ok_or("Missing application link scheme")?;
    typr_notification2::show(typr_notification2::Notification {
        title,
        message,
        url: Some(format!(
            "{}://typr.com/call-end?session_id={}",
            scheme, session_id
        )),
        timeout: Some(Duration::from_secs(10)),
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate() -> CallCandidate {
        CallCandidate {
            id: "zoom:process:call".to_string(),
            label: "Zoom".to_string(),
        }
    }

    fn recording() -> Controller {
        let mut controller = Controller::default();
        controller.set_permission(true);
        controller.set_enabled(true);
        controller.sync_session(Some("note".to_string()), Some("run-1".to_string()));
        controller.observe(vec![candidate()], CallPresence::Unknown, Instant::now());
        controller
    }

    fn associated() -> Controller {
        let mut controller = recording();
        controller.associate("note", Some(&candidate().id)).unwrap();
        controller
    }

    #[test]
    fn disabled_by_default_and_never_automatically_associates_manual_recordings() {
        let mut disabled = Controller::default();
        let now = Instant::now();
        disabled.sync_session(Some("note".to_string()), Some("run".to_string()));
        assert!(disabled
            .observe(vec![candidate()], CallPresence::Ended, now)
            .is_none());
        assert_eq!(disabled.status(now), CallEndStatus::Off);

        let mut controller = recording();
        assert!(controller
            .observe(vec![candidate()], CallPresence::Ended, now + END_GRACE)
            .is_none());
        assert!(matches!(
            controller.status(now),
            CallEndStatus::AssociationRequired { .. }
        ));
    }

    #[test]
    fn confirmed_end_waits_full_two_minutes_and_requests_stop_once() {
        let mut controller = associated();
        let now = Instant::now();
        assert!(controller
            .observe(vec![], CallPresence::Ended, now)
            .is_none());
        assert!(matches!(
            controller.status(now),
            CallEndStatus::Countdown {
                remaining_seconds: 120,
                ..
            }
        ));
        assert!(controller
            .observe(vec![], CallPresence::Ended, now + Duration::from_secs(119))
            .is_none());
        let stop = controller
            .observe(vec![], CallPresence::Ended, now + END_GRACE)
            .unwrap();
        assert_eq!(stop.session_id, "note");
        assert_eq!(stop.run_token, "run-1");
        assert!(stop.permit.load(Ordering::SeqCst));
        assert!(controller
            .observe(vec![], CallPresence::Ended, now + END_GRACE)
            .is_none());
        assert!(controller.request_stop(false).is_none());
    }

    #[test]
    fn resumed_call_cancels_countdown_and_later_end_gets_new_two_minutes() {
        let mut controller = associated();
        let now = Instant::now();
        controller.observe(vec![], CallPresence::Ended, now);
        controller.observe(vec![], CallPresence::Active, now + Duration::from_secs(119));
        assert!(matches!(
            controller.status(now + END_GRACE),
            CallEndStatus::Monitoring { .. }
        ));
        assert!(controller
            .observe(vec![], CallPresence::Ended, now + END_GRACE)
            .is_none());
        assert!(controller
            .observe(vec![], CallPresence::Ended, now + Duration::from_secs(239))
            .is_none());
        assert!(controller
            .observe(vec![], CallPresence::Ended, now + Duration::from_secs(240))
            .is_some());
    }

    #[test]
    fn unknown_cancels_countdown_and_requires_user_decision() {
        let mut controller = associated();
        let now = Instant::now();
        controller.observe(vec![], CallPresence::Ended, now);
        controller.observe(
            vec![],
            CallPresence::Unknown,
            now + Duration::from_secs(119),
        );
        assert!(matches!(
            controller.status(now + END_GRACE),
            CallEndStatus::Uncertain { .. }
        ));
        assert!(controller
            .observe(
                vec![],
                CallPresence::Unknown,
                now + Duration::from_secs(900)
            )
            .is_none());
        assert!(controller
            .observe(vec![], CallPresence::Ended, now + Duration::from_secs(901))
            .is_none());
        assert!(matches!(
            controller.status(now + Duration::from_secs(901)),
            CallEndStatus::Countdown {
                remaining_seconds: 120,
                ..
            }
        ));
    }

    #[test]
    fn independent_recording_ignores_unrelated_online_call() {
        let mut controller = recording();
        controller.associate("note", None).unwrap();
        let now = Instant::now();
        assert!(controller
            .observe(
                vec![candidate()],
                CallPresence::Ended,
                now + Duration::from_secs(900)
            )
            .is_none());
        assert_eq!(controller.status(now), CallEndStatus::Idle);
        assert!(controller.request_stop(false).is_none());
    }

    #[test]
    fn keep_recording_or_disable_revokes_stop_waiting_for_listener_lock() {
        let mut controller = associated();
        let stop = controller.request_stop(false).unwrap();
        controller.associate("note", None).unwrap();
        assert!(!stop.permit.load(Ordering::SeqCst));

        let mut controller = associated();
        let stop = controller.request_stop(false).unwrap();
        controller.set_enabled(false);
        assert!(!stop.permit.load(Ordering::SeqCst));
        assert_eq!(controller.status(Instant::now()), CallEndStatus::Off);
    }

    #[test]
    fn new_recording_on_same_note_revokes_old_stop_and_requires_new_association() {
        let mut controller = associated();
        let stop = controller.request_stop(false).unwrap();
        assert!(controller.sync_session(Some("note".to_string()), Some("run-2".to_string())));
        assert!(!stop.permit.load(Ordering::SeqCst));
        assert!(controller.source.is_none());
        controller.observe(vec![candidate()], CallPresence::Ended, Instant::now());
        assert!(controller.request_stop(false).is_none());
    }

    #[test]
    fn stale_session_or_source_cannot_replace_current_association() {
        let mut controller = associated();
        assert!(controller.associate("another-note", None).is_err());
        assert!(controller.associate("note", Some("another-call")).is_err());
        assert_eq!(controller.source, Some(candidate()));
    }

    #[test]
    fn rejoin_or_unknown_revokes_automatic_stop_waiting_for_listener_lock() {
        for presence in [CallPresence::Active, CallPresence::Unknown] {
            let mut controller = associated();
            let now = Instant::now();
            controller.observe(vec![], CallPresence::Ended, now);
            let stop = controller
                .observe(vec![], CallPresence::Ended, now + END_GRACE)
                .unwrap();
            controller.observe(vec![], presence, now + END_GRACE);
            assert!(!stop.permit.load(Ordering::SeqCst));
            assert!(!controller.stop_requested);
            assert!(controller.deadline.is_none());
        }
    }

    #[test]
    fn explicit_user_stop_is_not_cancelled_by_call_still_being_active() {
        let mut controller = associated();
        let stop = controller.request_stop(false).unwrap();
        controller.observe(vec![], CallPresence::Active, Instant::now());
        assert!(stop.permit.load(Ordering::SeqCst));
        assert!(controller.stop_requested);
    }

    #[test]
    fn manual_stop_and_timer_expiry_cannot_complete_twice() {
        let mut controller = associated();
        let now = Instant::now();
        controller.observe(vec![], CallPresence::Ended, now);
        assert!(controller.request_stop(false).is_some());
        assert!(controller
            .observe(vec![], CallPresence::Ended, now + END_GRACE)
            .is_none());
    }

    #[test]
    fn denied_permission_is_actionable_without_a_call_and_cannot_arm_a_stop() {
        let mut controller = recording();
        controller.set_permission(false);
        assert_eq!(controller.status(Instant::now()), CallEndStatus::PermissionRequired);
        assert!(controller.observe(vec![candidate()], CallPresence::Ended, Instant::now()).is_none());
        assert!(controller.associate("note", Some(&candidate().id)).is_err());
        assert!(controller.request_stop(true).is_none());
        controller.set_enabled(false);
        assert_eq!(controller.status(Instant::now()), CallEndStatus::Off);
    }

    #[test]
    fn permission_revocation_cancels_countdown_and_grant_starts_fresh_grace() {
        let mut controller = associated();
        let now = Instant::now();
        controller.observe(vec![], CallPresence::Ended, now);
        controller.set_permission(false);
        assert!(controller.deadline.is_none());
        assert_eq!(controller.status(now + END_GRACE), CallEndStatus::PermissionRequired);
        assert!(controller.observe(vec![], CallPresence::Ended, now + END_GRACE).is_none());
        controller.set_permission(true);
        assert!(controller.observe(vec![], CallPresence::Active, now + END_GRACE).is_none());
        assert!(matches!(controller.status(now + END_GRACE), CallEndStatus::Monitoring { .. }));
        let later = now + Duration::from_secs(300);
        assert!(controller.observe(vec![], CallPresence::Ended, later).is_none());
        assert!(matches!(controller.status(later), CallEndStatus::Countdown { remaining_seconds: 120, .. }));
        assert!(controller.observe(vec![], CallPresence::Ended, later + END_GRACE).is_some());
    }

    #[test]
    fn permission_revocation_revokes_a_queued_automatic_stop() {
        let mut controller = associated();
        let now = Instant::now();
        controller.observe(vec![], CallPresence::Ended, now);
        let stop = controller.observe(vec![], CallPresence::Ended, now + END_GRACE).unwrap();
        controller.set_permission(false);
        assert!(!stop.permit.load(Ordering::SeqCst));
        assert!(!controller.stop_requested);
        assert_eq!(controller.status(now + END_GRACE), CallEndStatus::PermissionRequired);
    }
}
