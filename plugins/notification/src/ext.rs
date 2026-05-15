use std::{future::Future, sync::mpsc, time::Instant};

use tokio::time::{timeout, Duration};

use crate::error::Error;
use serde::Deserialize;
use tauri_plugin_db::DatabasePluginExt;
use tauri_plugin_listener::ListenerPluginExt;
use tauri_plugin_store2::StorePluginExt;

pub(crate) type LifecycleInput = crate::lifecycle::Input;

/// Messages the orchestrator loop processes.
pub(crate) enum OrchestratorMessage {
    /// A lifecycle input for the FSM (audio signal, session state change, tick).
    Lifecycle(LifecycleInput),
    /// A meeting app/URL was detected. Carries the raw signal for display name resolution.
    /// Also fed into the FSM as `MeetingSignal`.
    MeetingAppDetected(String),
    /// The user tapped "Take Notes" on a meeting notification.
    TakeNotesAction,
}

pub trait NotificationPluginExt<R: tauri::Runtime> {
    fn notification_store(&self) -> tauri_plugin_store2::ScopedStore<R, crate::StoreKey>;

    fn get_event_notification(&self) -> Result<bool, Error>;
    fn set_event_notification(&self, enabled: bool) -> Result<(), Error>;

    fn get_detect_notification(&self) -> Result<bool, Error>;
    fn set_detect_notification(&self, enabled: bool) -> Result<(), Error>;

    fn start_event_notification(&self) -> impl Future<Output = Result<(), Error>>;
    fn stop_event_notification(&self) -> Result<(), Error>;

    fn start_detect_notification(&self) -> Result<(), Error>;
    fn stop_detect_notification(&self) -> Result<(), Error>;

    fn open_notification_settings(&self) -> Result<(), Error>;
    fn request_notification_permission(&self) -> Result<(), Error>;
    fn check_notification_permission(
        &self,
    ) -> impl Future<Output = Result<typr_notification2::NotificationPermission, Error>>;
}

impl<R: tauri::Runtime, T: tauri::Manager<R> + tauri::Listener<R>> NotificationPluginExt<R> for T {
    fn notification_store(&self) -> tauri_plugin_store2::ScopedStore<R, crate::StoreKey> {
        self.scoped_store(crate::PLUGIN_NAME).unwrap()
    }

    #[tracing::instrument(skip(self))]
    fn get_event_notification(&self) -> Result<bool, Error> {
        let store = self.notification_store();
        store
            .get(crate::StoreKey::EventNotification)
            .map_err(Error::Store)
            .map(|v| v.unwrap_or(false))
    }

    #[tracing::instrument(skip(self))]
    fn set_event_notification(&self, enabled: bool) -> Result<(), Error> {
        let store = self.notification_store();
        store
            .set(crate::StoreKey::EventNotification, enabled)
            .map_err(Error::Store)
    }

    #[tracing::instrument(skip(self))]
    fn get_detect_notification(&self) -> Result<bool, Error> {
        let store = self.notification_store();
        store
            .get(crate::StoreKey::DetectNotification)
            .map_err(Error::Store)
            .map(|v| v.unwrap_or(false))
    }

    #[tracing::instrument(skip(self))]
    fn set_detect_notification(&self, enabled: bool) -> Result<(), Error> {
        let store = self.notification_store();
        store
            .set(crate::StoreKey::DetectNotification, enabled)
            .map_err(Error::Store)
    }

    #[tracing::instrument(skip(self))]
    async fn start_event_notification(&self) -> Result<(), Error> {
        let db_state = self.state::<tauri_plugin_db::ManagedState>();
        let (db, user_id) = {
            let guard = db_state.lock().await;
            (
                guard.db.clone().expect("db"),
                guard.user_id.clone().expect("user_id"),
            )
        };

        let state = self.state::<crate::SharedState>();
        let mut s = state.lock().unwrap();

        let deep_link_scheme = first_deep_link_scheme(self).unwrap_or_else(|| "typr".to_string());

        s.worker_handle = Some(tokio::runtime::Handle::current().spawn(async move {
            let _ = crate::worker::monitor(crate::worker::WorkerState {
                db,
                user_id,
                deep_link_scheme,
            })
            .await;
        }));

        Ok(())
    }

    #[tracing::instrument(skip(self))]
    fn stop_event_notification(&self) -> Result<(), Error> {
        let state = self.state::<crate::SharedState>();
        let mut guard = state.lock().unwrap();

        if let Some(handle) = guard.worker_handle.take() {
            handle.abort();
        }

        Ok(())
    }

    #[tracing::instrument(skip(self))]
    fn start_detect_notification(&self) -> Result<(), Error> {
        tracing::info!("🔔 Starting meeting lifecycle detection");

        {
            let state = self.state::<crate::SharedState>();
            let guard = state.lock().unwrap();
            if guard.lifecycle_handle.is_some() {
                tracing::info!("meeting lifecycle orchestrator already running");
                return Ok(());
            }
        }

        let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<OrchestratorMessage>();
        let tx_for_listener = tx.clone();
        let listener_event_id = self.listen_any(
            "plugin:listener:session-event",
            move |event: tauri::Event| {
                if let Some(input) = classify_listener_session_event_payload(event.payload()) {
                    let _ = tx_for_listener.send(OrchestratorMessage::Lifecycle(input));
                }
            },
        );

        let tx_for_detector = tx.clone();
        let cb = typr_detect::new_callback(move |signal| {
            if let Some(msg) = classify_detector_signal_to_message(&signal) {
                let _ = tx_for_detector.send(msg);
            }
        });

        // Set up notification action handler.
        #[cfg(target_os = "macos")]
        {
            let tx_for_action = tx.clone();
            let action_take_notes = typr_notification2::action_take_notes();
            typr_notification2::set_action_handler(move |action_id| {
                if action_id == action_take_notes {
                    let _ = tx_for_action.send(OrchestratorMessage::TakeNotesAction);
                }
            });
        }

        let app = self.app_handle().clone();

        let state = self.state::<crate::SharedState>();
        let mut guard = state.lock().unwrap();
        guard.detector.start(cb);
        guard.listener_event_id = Some(listener_event_id);
        guard.lifecycle_signal_tx = Some(tx);
        guard.lifecycle_handle = Some(tokio::runtime::Handle::current().spawn(async move {
            run_lifecycle_orchestrator(app, rx).await;
        }));

        Ok(())
    }

    #[tracing::instrument(skip(self))]
    fn stop_detect_notification(&self) -> Result<(), Error> {
        let state = self.state::<crate::SharedState>();
        let (listener_event_id, lifecycle_handle) = {
            let mut guard = state.lock().unwrap();
            guard.detector.stop();
            guard.lifecycle_signal_tx.take();
            (
                guard.listener_event_id.take(),
                guard.lifecycle_handle.take(),
            )
        };

        if let Some(id) = listener_event_id {
            self.unlisten(id);
        }

        if let Some(handle) = lifecycle_handle {
            handle.abort();
        }

        Ok(())
    }

    #[tracing::instrument(skip(self))]
    fn open_notification_settings(&self) -> Result<(), Error> {
        typr_notification2::open_notification_settings().map_err(Error::Io)
    }

    #[tracing::instrument(skip(self))]
    fn request_notification_permission(&self) -> Result<(), Error> {
        #[cfg(target_os = "macos")]
        let _ = typr_detect::Detector::default().macos_request_accessibility_permission();

        typr_notification2::request_notification_permission();

        Ok(())
    }

    #[tracing::instrument(skip(self))]
    async fn check_notification_permission(
        &self,
    ) -> Result<typr_notification2::NotificationPermission, Error> {
        let (tx, rx) = mpsc::channel();

        typr_notification2::check_notification_permission(move |result| {
            let _ = tx.send(result);
        });

        timeout(Duration::from_secs(3), async move {
            rx.recv()
                .map_err(|_| Error::ChannelClosed)
                .and_then(|result| result.map_err(|_| Error::ChannelClosed))
        })
        .await
        .map_err(|_| Error::PermissionTimeout)?
    }
}

fn first_deep_link_scheme<R: tauri::Runtime, T: tauri::Manager<R>>(app: &T) -> Option<String> {
    let deep_link = app.config().plugins.0.get("deep-link")?;
    let schemes = deep_link
        .get("desktop")
        .and_then(|desktop| desktop.get("schemes"))?;

    schemes
        .as_array()?
        .iter()
        .find_map(|scheme| scheme.as_str().map(ToOwned::to_owned))
}

#[derive(Debug, Deserialize)]
struct SessionEventPayload {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(default)]
    mic: Option<u16>,
    #[serde(default)]
    speaker: Option<u16>,
}

fn classify_detector_signal_to_message(signal: &str) -> Option<OrchestratorMessage> {
    if signal == "microphone_in_use" {
        return Some(OrchestratorMessage::Lifecycle(LifecycleInput::AudioSignal));
    }

    if is_meeting_presence_signal(signal) {
        return Some(OrchestratorMessage::MeetingAppDetected(signal.to_string()));
    }

    None
}

fn meeting_signal_to_display_name(signal: &str) -> &str {
    match signal {
        "us.zoom.xos" | "zoom" | "zoomworkplace" => "Zoom",
        "com.microsoft.teams" | "com.microsoft.teams2" | "teams" | "msteams" | "ms-teams" => {
            "Microsoft Teams"
        }
        "cisco-systems.spark" | "webex" | "ciscocollabhost" => "Webex",
        url if url.contains("meet.google.com") => "Google Meet",
        url if url.contains("zoom.us") => "Zoom",
        url if url.contains("teams.microsoft.com") => "Microsoft Teams",
        url if url.contains("webex.com") => "Webex",
        url if url.contains("cal.com") => "Cal.com",
        _ => "Unknown meeting",
    }
}

fn is_meeting_presence_signal(signal: &str) -> bool {
    if signal.starts_with("http://") || signal.starts_with("https://") {
        return true;
    }

    matches!(
        signal,
        // macOS bundle IDs
        "us.zoom.xos"
            | "cisco-systems.spark"
            | "com.microsoft.teams"
            | "com.microsoft.teams2"
            // Windows/Linux executable identifiers
            | "zoom"
            | "zoomworkplace"
            | "teams"
            | "msteams"
            | "ms-teams"
            | "webex"
            | "ciscocollabhost"
    )
}

fn classify_listener_session_event_payload(payload: &str) -> Option<LifecycleInput> {
    let Ok(event) = serde_json::from_str::<SessionEventPayload>(payload) else {
        return None;
    };

    match event.event_type.as_str() {
        "running_active" => Some(LifecycleInput::SessionStateChanged(
            crate::lifecycle::SessionState::RunningActive,
        )),
        "running_paused" => Some(LifecycleInput::SessionStateChanged(
            crate::lifecycle::SessionState::RunningPaused,
        )),
        "inactive" => Some(LifecycleInput::SessionStateChanged(
            crate::lifecycle::SessionState::Inactive,
        )),
        "audioAmplitude" => {
            let mic = event.mic.unwrap_or(0);
            let speaker = event.speaker.unwrap_or(0);
            if mic > 0 || speaker > 0 {
                Some(LifecycleInput::AudioSignal)
            } else {
                None
            }
        }
        _ => None,
    }
}

async fn create_auto_session<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<String, String> {
    let user_id = app
        .db_user_id()
        .await
        .map_err(|e| format!("failed to get user id: {}", e))?
        .ok_or_else(|| "missing user id".to_string())?;

    let now = chrono::Utc::now();
    let session_id = uuid::Uuid::new_v4().to_string();
    let session = typr_db_user::Session {
        id: session_id.clone(),
        created_at: now,
        visited_at: now,
        user_id,
        calendar_event_id: None,
        title: "Auto-detected meeting".to_string(),
        raw_memo_html: String::new(),
        enhanced_memo_html: None,
        auto_enhanced_memo_html: None,
        conversations: vec![],
        words: vec![],
        record_start: None,
        record_end: None,
        pre_meeting_memo_html: None,
        source_type: Some("auto-detect".to_string()),
        source_metadata: None,
        space_id: None,
        needs_enhance: false,
    };

    app.db_upsert_session(session)
        .await
        .map_err(|e| format!("failed to persist auto session: {}", e))?;

    Ok(session_id)
}

fn parse_listener_state(value: &serde_json::Value) -> Option<crate::lifecycle::SessionState> {
    if let Some(state) = value.as_str() {
        return match state {
            "inactive" => Some(crate::lifecycle::SessionState::Inactive),
            "running_active" => Some(crate::lifecycle::SessionState::RunningActive),
            "running_paused" => Some(crate::lifecycle::SessionState::RunningPaused),
            _ => None,
        };
    }

    value
        .get("type")
        .and_then(serde_json::Value::as_str)
        .and_then(|state| match state {
            "inactive" => Some(crate::lifecycle::SessionState::Inactive),
            "running_active" => Some(crate::lifecycle::SessionState::RunningActive),
            "running_paused" => Some(crate::lifecycle::SessionState::RunningPaused),
            _ => None,
        })
}

async fn read_listener_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::lifecycle::SessionState {
    let Ok(value) = serde_json::to_value(app.get_state().await) else {
        return crate::lifecycle::SessionState::Inactive;
    };

    parse_listener_state(&value).unwrap_or(crate::lifecycle::SessionState::Inactive)
}

async fn run_lifecycle_orchestrator<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<OrchestratorMessage>,
) {
    let mut controller = crate::lifecycle::Controller::default();
    let mut auto_session_id: Option<String> = None;
    let mut meeting_prompt_shown = false;
    let mut last_meeting_signal: Option<String> = None;
    let mut last_meeting_signal_time: Option<Instant> = None;
    let mut tick = tokio::time::interval(Duration::from_secs(5));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    let state = read_listener_state(&app).await;
    let _ = controller.on_input(LifecycleInput::SessionStateChanged(state), Instant::now());

    loop {
        let msg = tokio::select! {
            maybe_msg = rx.recv() => {
                match maybe_msg {
                    Some(msg) => msg,
                    None => break,
                }
            }
            _ = tick.tick() => {
                OrchestratorMessage::Lifecycle(LifecycleInput::Tick)
            }
        };

        match msg {
            OrchestratorMessage::Lifecycle(input) => {
                process_lifecycle_input(&app, &mut controller, &mut auto_session_id, input).await;

                // Keep controller synchronized even if event delivery is delayed.
                if matches!(input, LifecycleInput::Tick) {
                    let current = read_listener_state(&app).await;
                    process_lifecycle_input(
                        &app,
                        &mut controller,
                        &mut auto_session_id,
                        LifecycleInput::SessionStateChanged(current),
                    )
                    .await;
                }

                // Reset prompt flag when session becomes inactive.
                if matches!(
                    input,
                    LifecycleInput::SessionStateChanged(crate::lifecycle::SessionState::Inactive)
                ) {
                    meeting_prompt_shown = false;
                }

                // Show notification when mic device is claimed while a meeting app is known.
                // CoreAudio's DEVICE_IS_RUNNING_SOMEWHERE fires even when muted in Zoom —
                // it means the app opened the audio device, i.e. user actually joined the meeting.
                if matches!(input, LifecycleInput::AudioSignal)
                    && last_meeting_signal.is_some()
                    && !meeting_prompt_shown
                    && auto_session_id.is_none()
                {
                    let signal = last_meeting_signal.as_deref().unwrap_or("unknown");
                    let display_name = meeting_signal_to_display_name(signal);
                    tracing::info!("showing meeting detected notification for {}", display_name);

                    #[cfg(target_os = "macos")]
                    typr_notification2::show_meeting_detected(display_name);

                    #[cfg(not(target_os = "macos"))]
                    typr_notification2::show(typr_notification2::Notification {
                        title: "Meeting detected".to_string(),
                        message: display_name.to_string(),
                        url: None,
                        timeout: Some(Duration::from_secs(10)),
                    });

                    meeting_prompt_shown = true;
                }
            }
            OrchestratorMessage::MeetingAppDetected(signal) => {
                // Reset prompt flag if this is a new meeting (app quit and reopened).
                if meeting_prompt_shown {
                    let is_new_launch = last_meeting_signal_time
                        .map(|t| t.elapsed() > Duration::from_secs(30))
                        .unwrap_or(true);
                    if is_new_launch {
                        tracing::info!("resetting meeting prompt (new launch detected)");
                        meeting_prompt_shown = false;
                    }
                }
                last_meeting_signal = Some(signal.clone());
                last_meeting_signal_time = Some(Instant::now());

                // Feed MeetingSignal into the FSM (preserves existing auto-start behaviour).
                process_lifecycle_input(
                    &app,
                    &mut controller,
                    &mut auto_session_id,
                    LifecycleInput::MeetingSignal,
                )
                .await;

                // No notification here — meeting app running ≠ in a meeting.
                // Notification fires when AudioSignal arrives (mic device claimed = user joined).
            }
            OrchestratorMessage::TakeNotesAction => {
                // User clicked "Take Notes" on the notification.
                if auto_session_id.is_some() {
                    tracing::info!("Take Notes clicked but session already active");
                    continue;
                }

                tracing::info!("Take Notes clicked — starting session");
                if let Some(session_id) =
                    start_auto_session(&app, &mut controller, &mut auto_session_id).await
                {
                    let app_name = last_meeting_signal
                        .as_deref()
                        .map(meeting_signal_to_display_name)
                        .unwrap_or("meeting");
                    tracing::info!("auto session started for {} ({})", app_name, session_id);
                }
            }
        }
    }
}

/// Shared helper: create an auto-detected session and start recording.
/// Returns the session ID on success.
async fn start_auto_session<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    controller: &mut crate::lifecycle::Controller,
    auto_session_id: &mut Option<String>,
) -> Option<String> {
    let now = Instant::now();

    let session_id = match create_auto_session(app).await {
        Ok(id) => id,
        Err(err) => {
            tracing::error!("auto session creation failed: {}", err);
            controller.mark_auto_session_start_failed(now);
            return None;
        }
    };

    app.start_session(session_id.clone()).await;
    let state = read_listener_state(app).await;
    let _ = controller.on_input(LifecycleInput::SessionStateChanged(state), now);

    if state == crate::lifecycle::SessionState::Inactive {
        tracing::error!("auto session failed to start");
        controller.mark_auto_session_start_failed(now);
        return None;
    }

    *auto_session_id = Some(session_id.clone());
    controller.mark_auto_session_started(now);
    Some(session_id)
}

async fn process_lifecycle_input<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    controller: &mut crate::lifecycle::Controller,
    auto_session_id: &mut Option<String>,
    input: LifecycleInput,
) {
    let now = Instant::now();
    let Some(action) = controller.on_input(input, now) else {
        return;
    };

    match action {
        crate::lifecycle::Action::StartAutoSession => {
            // Auto-start from the FSM is disabled. Sessions are only started
            // by explicit user action: either the "Take Notes" notification
            // button (TakeNotesAction) or manual start in the UI.
            // The FSM controller set auto_session_active=true optimistically
            // in decide(), so we must mark it as failed to reset the state.
            tracing::debug!("auto-start suppressed (sessions require explicit user action)");
            controller.mark_auto_session_start_failed(now);
        }
        crate::lifecycle::Action::PauseAutoSession => {
            if auto_session_id.is_none() {
                return;
            }

            app.pause_session().await;
            let state = read_listener_state(app).await;
            let _ = controller.on_input(LifecycleInput::SessionStateChanged(state), now);
        }
        crate::lifecycle::Action::ResumeAutoSession => {
            if auto_session_id.is_none() {
                return;
            }

            app.resume_session().await;
            let state = read_listener_state(app).await;
            let _ = controller.on_input(LifecycleInput::SessionStateChanged(state), now);
        }
        crate::lifecycle::Action::StopAutoSession => {
            if auto_session_id.is_none() {
                return;
            }

            app.stop_session().await;
            *auto_session_id = None;
            controller.mark_auto_session_stopped(now);
            let _ = controller.on_input(
                LifecycleInput::SessionStateChanged(crate::lifecycle::SessionState::Inactive),
                now,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detector_signal_classification_is_strict() {
        assert!(matches!(
            classify_detector_signal_to_message("microphone_in_use"),
            Some(OrchestratorMessage::Lifecycle(LifecycleInput::AudioSignal))
        ));
        assert!(matches!(
            classify_detector_signal_to_message("us.zoom.xos"),
            Some(OrchestratorMessage::MeetingAppDetected(_))
        ));
        assert!(matches!(
            classify_detector_signal_to_message("https://meet.google.com/abc-defg-hij"),
            Some(OrchestratorMessage::MeetingAppDetected(_))
        ));
        assert!(classify_detector_signal_to_message("slack").is_none());
    }

    #[test]
    fn display_name_resolves_known_apps() {
        assert_eq!(meeting_signal_to_display_name("us.zoom.xos"), "Zoom");
        assert_eq!(meeting_signal_to_display_name("zoom"), "Zoom");
        assert_eq!(
            meeting_signal_to_display_name("com.microsoft.teams"),
            "Microsoft Teams"
        );
        assert_eq!(
            meeting_signal_to_display_name("com.microsoft.teams2"),
            "Microsoft Teams"
        );
        assert_eq!(
            meeting_signal_to_display_name("cisco-systems.spark"),
            "Webex"
        );
        assert_eq!(
            meeting_signal_to_display_name("https://meet.google.com/abc-defg-hij"),
            "Google Meet"
        );
        assert_eq!(
            meeting_signal_to_display_name("https://us04web.zoom.us/j/123456"),
            "Zoom"
        );
        assert_eq!(
            meeting_signal_to_display_name("https://teams.microsoft.com/l/meetup-join/abc"),
            "Microsoft Teams"
        );
        assert_eq!(
            meeting_signal_to_display_name("unknown-app"),
            "Unknown meeting"
        );
    }
}
