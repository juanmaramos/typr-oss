use std::{
    cell::Cell,
    time::{Duration, Instant},
};

use cidre::{arc, ax, cf, ns};

use super::{
    active_control, ended_heading, interrupted_heading, meet_call_id, return_control, CallApp,
    CallPresence, CallScan, CallSource,
};

// The native AX object is retained for CFEqual identity; a new generic meeting
// window is not assumed to be the same call. cidre declares UiElement Send.
#[derive(Clone)]
pub(super) struct SourceHandle {
    window: arc::R<ax::UiElement>,
    scope: arc::R<ax::UiElement>,
    pid: i32,
    launched: u64,
    bundle: String,
    call_id: Option<String>,
}

fn cf_string(value: &cf::Type) -> Option<&cf::String> {
    if value.get_type_id() != cf::String::type_id() {
        return None;
    }
    // Type checked before interpreting the CoreFoundation reference.
    Some(unsafe { &*(std::ptr::from_ref(value).cast()) })
}

const MAX_NODES: usize = 500;
const MAX_DEPTH: usize = 20;
const SCAN_TIME: Duration = Duration::from_millis(900);

struct Budget {
    until: Instant,
    remaining: usize,
    incomplete: Cell<bool>,
}

impl Budget {
    fn available(&self) -> bool {
        self.remaining > 0 && Instant::now() < self.until
    }

    fn value(&self, element: &ax::UiElement, attr: &ax::Attr) -> Option<arc::R<cf::Type>> {
        if !self.available() {
            self.incomplete.set(true);
            return None;
        }
        match element.attr_value(attr) {
            Ok(value) => Some(value),
            Err(error) => {
                if error != ax::err::ATTR_UNSUPPORTED && error != ax::err::NO_VALUE {
                    self.incomplete.set(true);
                }
                None
            }
        }
    }

    fn string(&self, element: &ax::UiElement, attr: &ax::Attr) -> Option<String> {
        let value = self.value(element, attr)?;
        let string = cf_string(&value)?;
        // Large labels are unrelated content and cannot be call-control labels.
        if string.len() > 200 {
            return None;
        }
        Some(string.to_string())
    }

    fn boolean(&self, element: &ax::UiElement, attr: &ax::Attr) -> Option<bool> {
        let value = self.value(element, attr)?;
        if value.get_type_id() != cf::Boolean::type_id() {
            return None;
        }
        let boolean: &cf::Boolean = unsafe { &*(std::ptr::from_ref(value.as_ref()).cast()) };
        Some(boolean.value())
    }

    fn elements(&self, element: &ax::UiElement, attr: &ax::Attr) -> Vec<arc::R<ax::UiElement>> {
        let Some(value) = self.value(element, attr) else {
            return Vec::new();
        };
        if value.get_type_id() != cf::Array::type_id() {
            return Vec::new();
        }
        let array: &cf::ArrayOf<cf::Type> =
            unsafe { &*(std::ptr::from_ref(value.as_ref()).cast()) };
        if array.len() > 128 {
            self.incomplete.set(true);
        }
        array
            .iter()
            .take(128)
            .filter_map(|value| {
                (value.get_type_id() == ax::UiElement::type_id()).then(|| {
                    // The CF type is checked before retaining the AX reference.
                    unsafe { cf::Type::retain::<ax::UiElement>(value) }
                })
            })
            .collect()
    }

    fn enter(&mut self, element: &ax::UiElement, depth: usize) -> Option<String> {
        if depth > MAX_DEPTH || !self.available() {
            self.incomplete.set(true);
            return None;
        }
        self.remaining -= 1;
        // Bound every cross-process AX request, including unresponsive clients.
        if element.set_messaging_timeout_secs(0.04).is_err() {
            self.incomplete.set(true);
            return None;
        }
        if self.boolean(element, ax::attr::hidden()) == Some(true) {
            return None;
        }
        self.string(element, ax::attr::role())
    }

    fn positive_bounds(&self, element: &ax::UiElement) -> bool {
        let Some(value) = self.value(element, ax::attr::size()) else {
            return false;
        };
        if value.get_type_id() != ax::Value::type_id() {
            return false;
        }
        // AXSize is only interpreted after checking its CF type.
        let value: &ax::Value = unsafe { &*(std::ptr::from_ref(value.as_ref()).cast()) };
        value
            .cg_size()
            .is_some_and(|size| size.width > 0.0 && size.height > 0.0)
    }
}

#[derive(Default)]
struct Controls {
    active: bool,
    teams_leave: bool,
    teams_surface: bool,
    ended_heading: bool,
    return_control: bool,
    interrupted: bool,
    truncated: bool,
}

impl Controls {
    fn presence(&self, complete: bool) -> CallPresence {
        if self.active || (self.teams_leave && self.teams_surface) {
            CallPresence::Active
        } else if complete
            && !self.truncated
            && self.ended_heading
            && self.return_control
            && !self.interrupted
        {
            CallPresence::Ended
        } else {
            CallPresence::Unknown
        }
    }
}

fn controls(
    element: &ax::UiElement,
    app: CallApp,
    depth: usize,
    budget: &mut Budget,
    evidence: &mut Controls,
) {
    let Some(role) = budget.enter(element, depth) else {
        evidence.truncated = true;
        return;
    };
    // Do not query input values, editable text, chat messages or static page text.
    if matches!(
        role.as_str(),
        "AXTextField" | "AXSecureTextField" | "AXTextArea"
    ) {
        return;
    }
    if matches!(role.as_str(), "AXButton" | "AXPopUpButton") {
        if budget.boolean(element, ax::attr::enabled()) == Some(true)
            && budget.positive_bounds(element)
        {
            for attr in [ax::attr::title(), ax::attr::desc()] {
                if let Some(label) = budget.string(element, attr) {
                    evidence.active |= active_control(app, &label);
                    let label = label.trim().to_lowercase();
                    evidence.teams_leave |=
                        app == CallApp::Teams && matches!(label.as_str(), "leave" | "salir");
                    evidence.return_control |= return_control(&label);
                    evidence.interrupted |= interrupted_heading(&label);
                }
            }
        }
    } else if role == "AXHeading" && budget.positive_bounds(element) {
        if let Some(label) = budget.string(element, ax::attr::title()) {
            let label = label.trim().to_lowercase();
            evidence.ended_heading |= ended_heading(&label);
            evidence.interrupted |= interrupted_heading(&label);
        }
    } else if app == CallApp::Teams && role == "AXGroup" {
        for attr in [ax::attr::title(), ax::attr::desc()] {
            if let Some(label) = budget.string(element, attr) {
                evidence.teams_surface |= matches!(
                    label.trim().to_lowercase().as_str(),
                    "meeting controls"
                        | "calling controls"
                        | "controles de la reunión"
                        | "controles de llamada"
                );
            }
        }
    }
    for child in budget.elements(element, ax::attr::children()) {
        if !budget.available() {
            break;
        }
        controls(&child, app, depth + 1, budget, evidence);
    }
}

fn web_areas(
    element: &ax::UiElement,
    depth: usize,
    budget: &mut Budget,
    out: &mut Vec<(arc::R<ax::UiElement>, String)>,
) {
    let Some(role) = budget.enter(element, depth) else {
        return;
    };
    if matches!(
        role.as_str(),
        "AXTextField" | "AXSecureTextField" | "AXTextArea"
    ) {
        return;
    }
    if role == "AXWebArea" {
        if !budget.positive_bounds(element) {
            return;
        }
        let Some(value) = budget.value(element, ax::attr::url()) else {
            return;
        };
        let url = if let Some(value) = cf_string(&value) {
            value.to_string()
        } else if value.get_type_id() == cf::Url::type_id() {
            let url: &cf::Url = unsafe { &*(std::ptr::from_ref(value.as_ref()).cast()) };
            url.cf_string().to_string()
        } else {
            return;
        };
        if let Some(call_id) = meet_call_id(&url) {
            out.push((element.retained(), call_id));
        }
        return;
    }
    for child in budget.elements(element, ax::attr::children()) {
        if !budget.available() {
            break;
        }
        web_areas(&child, depth + 1, budget, out);
    }
}

fn app_for_bundle(bundle: &str) -> Option<CallApp> {
    match bundle {
        "us.zoom.xos" => Some(CallApp::Zoom),
        "com.microsoft.teams" | "com.microsoft.teams2" => Some(CallApp::Teams),
        "com.google.Chrome"
        | "com.microsoft.edgemac"
        | "com.apple.Safari"
        | "org.mozilla.firefox" => Some(CallApp::Meet),
        _ => None,
    }
}

fn can_host_rejoined_call(
    bound_bundle: &str,
    browser_call: bool,
    bundle: &str,
    app: CallApp,
) -> bool {
    bundle == bound_bundle || (browser_call && app == CallApp::Meet)
}

fn original_process(pid: i32, launched: Option<u64>, bound_pid: i32, bound_launched: u64) -> bool {
    pid == bound_pid && launched == Some(bound_launched)
}

fn exited_source_presence(
    presence: CallPresence,
    original_process_running: bool,
    possible_replacement: bool,
) -> CallPresence {
    if original_process_running || presence == CallPresence::Active {
        presence
    } else if possible_replacement {
        CallPresence::Unknown
    } else {
        CallPresence::Ended
    }
}

pub(super) fn scan_calls(bound: Option<&CallSource>) -> CallScan {
    cidre::objc::ar_pool(|| scan_calls_inner(bound))
}

fn scan_calls_inner(bound: Option<&CallSource>) -> CallScan {
    let mut scan = CallScan::default();
    if !ax::is_process_trusted() {
        return scan;
    }
    let apps = ns::Workspace::shared().running_apps();
    let mut budget = Budget {
        until: Instant::now() + SCAN_TIME,
        remaining: MAX_NODES,
        incomplete: Cell::new(false),
    };
    let original_process_running = bound
        .and_then(|bound| ns::RunningApp::with_pid(bound.handle.pid))
        .is_some_and(|app| !app.is_terminated());
    let mut replacement_possible = false;
    for running in apps.iter() {
        let Some(bundle) = running.bundle_id().map(|value| value.to_string()) else {
            continue;
        };
        let Some(app) = app_for_bundle(&bundle) else {
            continue;
        };
        let pid = running.pid();
        let launched = running
            .launch_date()
            .map(|date| date.time_interval_since_1970().to_bits());
        if let Some(bound) = bound {
            // A Meet call can rejoin in another browser. Record possible replacements
            // before skipping missing process identity, hidden UI, or exhausted budgets.
            replacement_possible |=
                !original_process(pid, launched, bound.handle.pid, bound.handle.launched)
                    && can_host_rejoined_call(
                        &bound.handle.bundle,
                        bound.handle.call_id.is_some(),
                        &bundle,
                        app,
                    );
        }
        let Some(launched) = launched else {
            continue;
        };
        if running.is_hidden() || !budget.available() {
            continue;
        }
        let ax_app = ax::UiElement::with_app_pid(pid);
        let _ = ax_app.set_messaging_timeout_secs(0.04);
        for window in budget
            .elements(&ax_app, ax::attr::windows())
            .into_iter()
            .take(8)
        {
            if !budget.available() {
                break;
            }
            let _ = window.set_messaging_timeout_secs(0.04);
            if budget.boolean(&window, ax::attr::minimized()) != Some(false) {
                continue;
            }
            let scopes = if app == CallApp::Meet {
                let mut areas = Vec::new();
                web_areas(&window, 0, &mut budget, &mut areas);
                areas
                    .into_iter()
                    .map(|(area, id)| (area, Some(id)))
                    .collect::<Vec<_>>()
            } else {
                vec![(window.clone(), None)]
            };
            for (scope, call_id) in scopes {
                let mut evidence = Controls::default();
                controls(&scope, app, 0, &mut budget, &mut evidence);
                let presence = evidence.presence(budget.available() && !budget.incomplete.get());
                let handle = SourceHandle {
                    window: window.clone(),
                    scope,
                    pid,
                    launched,
                    bundle: bundle.clone(),
                    call_id,
                };
                if let Some(bound) = bound {
                    let same_call = match (&bound.handle.call_id, &handle.call_id) {
                        (Some(previous), Some(current)) => previous == current,
                        (None, None) => {
                            bound.handle.pid == pid
                                && bound.handle.launched == launched
                                && bound.handle.window.equal(&handle.window)
                        }
                        _ => false,
                    };
                    if same_call
                        && (presence == CallPresence::Active
                            || scan.bound_presence != CallPresence::Active)
                    {
                        scan.bound_presence = presence;
                    }
                }
                if presence == CallPresence::Active {
                    let label = app.label().to_string();
                    scan.candidates.push(CallSource {
                        id: format!(
                            "macos:{pid}:{launched}:{}:{}",
                            handle.window.hash(),
                            handle.scope.hash()
                        ),
                        label,
                        handle,
                    });
                }
            }
        }
    }
    if !ax::is_process_trusted() {
        return CallScan::default();
    }
    if bound.is_some() {
        scan.bound_presence = exited_source_presence(
            scan.bound_presence,
            original_process_running,
            replacement_possible,
        );
    }
    scan
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_source_can_move_to_blocking_scanner_without_unsafe_impls() {
        fn assert_send<T: Send>() {}
        assert_send::<CallSource>();
        assert_send::<CallScan>();
    }

    #[test]
    fn incomplete_or_interrupted_post_call_screen_is_unknown() {
        let mut controls = Controls {
            ended_heading: true,
            return_control: true,
            ..Default::default()
        };
        assert_eq!(controls.presence(true), CallPresence::Ended);
        assert_eq!(controls.presence(false), CallPresence::Unknown);
        controls.interrupted = true;
        assert_eq!(controls.presence(true), CallPresence::Unknown);
        controls.active = true;
        assert_eq!(controls.presence(true), CallPresence::Active);
    }

    #[test]
    fn teams_generic_leave_requires_its_meeting_control_surface() {
        let mut controls = Controls {
            teams_leave: true,
            ..Default::default()
        };
        assert_eq!(controls.presence(true), CallPresence::Unknown);
        controls.teams_surface = true;
        assert_eq!(controls.presence(true), CallPresence::Active);
    }

    #[test]
    fn hidden_unreadable_or_budget_limited_cross_browser_rejoin_is_unknown() {
        for replacement_bundle in [
            "com.microsoft.edgemac",
            "com.apple.Safari",
            "org.mozilla.firefox",
        ] {
            let replacement_possible = can_host_rejoined_call(
                "com.google.Chrome",
                true,
                replacement_bundle,
                CallApp::Meet,
            );
            assert!(replacement_possible);
            // Each skipped/unreadable scan leaves no affirmative call evidence.
            for presence in [CallPresence::Unknown, CallPresence::Ended] {
                assert_eq!(
                    exited_source_presence(presence, false, replacement_possible),
                    CallPresence::Unknown,
                );
            }
            assert_eq!(
                exited_source_presence(CallPresence::Active, false, replacement_possible),
                CallPresence::Active,
            );
        }
    }

    #[test]
    fn exited_call_without_possible_replacement_remains_confirmed_ended() {
        assert!(!can_host_rejoined_call(
            "us.zoom.xos",
            false,
            "com.google.Chrome",
            CallApp::Meet
        ));
        assert!(!can_host_rejoined_call(
            "com.google.Chrome",
            true,
            "com.microsoft.teams2",
            CallApp::Teams
        ));
        assert!(can_host_rejoined_call(
            "us.zoom.xos",
            false,
            "us.zoom.xos",
            CallApp::Zoom
        ));
        assert_eq!(
            exited_source_presence(CallPresence::Unknown, false, false),
            CallPresence::Ended,
        );
        assert_eq!(
            exited_source_presence(CallPresence::Unknown, true, false),
            CallPresence::Unknown,
        );
    }

    #[test]
    fn missing_launch_identity_never_excludes_a_possible_replacement() {
        assert!(original_process(10, Some(20), 10, 20));
        for (pid, launched) in [(10, None), (11, None), (10, Some(21)), (11, Some(20))] {
            let replacement_possible = !original_process(pid, launched, 10, 20)
                && can_host_rejoined_call(
                    "com.google.Chrome",
                    true,
                    "com.google.Chrome",
                    CallApp::Meet,
                );
            assert!(replacement_possible);
            assert_eq!(
                exited_source_presence(CallPresence::Unknown, false, replacement_possible),
                CallPresence::Unknown,
            );
        }
    }
}
