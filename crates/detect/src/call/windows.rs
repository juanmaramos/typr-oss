//! Read-only UI Automation. No audio, window-title, or missing-control heuristic
//! establishes an end. Hidden/inaccessible UI deliberately remains unknown.

use std::{
    collections::VecDeque,
    sync::Arc,
    time::{Duration, Instant},
};
use windows::{
    core::{Interface, PWSTR},
    Win32::{
        Foundation::{CloseHandle, FILETIME, HANDLE, HWND, LPARAM, WAIT_OBJECT_0},
        System::{
            Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                COINIT_MULTITHREADED,
            },
            Threading::{
                GetProcessTimes, OpenProcess, QueryFullProcessImageNameW, WaitForSingleObject,
                PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
            },
        },
        UI::{
            Accessibility::*,
            WindowsAndMessaging::{
                EnumWindows, GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible,
            },
        },
    },
};

use super::{
    active_control, ended_heading, interrupted_heading, meet_call_id, return_control, CallApp,
    CallPresence, CallScan, CallSource,
};

#[derive(Clone)]
pub(super) struct SourceHandle {
    process: Arc<ProcessHandle>,
    app: CallApp,
    call_id: String,
}

// Keep the original kernel object open: PID reuse can never end another call.
struct ProcessHandle(isize);
impl Drop for ProcessHandle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(HANDLE(self.0 as _));
        }
    }
}

struct ComApartment;
impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

#[derive(Default)]
struct Controls {
    active: bool,
    teams_leave: bool,
    teams_surface: bool,
    return_control: bool,
    ended_heading: bool,
    interrupted: bool,
    incomplete: bool,
}
impl Controls {
    fn observe(&mut self, app: CallApp, label: &str) {
        self.active |= active_control(app, label);
        self.teams_leave |= app == CallApp::Teams
            && matches!(label.trim().to_lowercase().as_str(), "leave" | "salir");
        // The action and ended heading must belong to one validated Meet
        // document. A prejoin screen or absence of Leave never means ended.
        if app == CallApp::Meet {
            self.return_control |= return_control(label);
        }
    }
    fn presence(&self) -> CallPresence {
        if self.active || (self.teams_leave && self.teams_surface) {
            CallPresence::Active
        } else if self.return_control && self.ended_heading && !self.interrupted && !self.incomplete
        {
            CallPresence::Ended
        } else {
            CallPresence::Unknown
        }
    }
}

fn replacement_presence(current: CallPresence, possibly_rejoined: bool) -> CallPresence {
    if possibly_rejoined && current == CallPresence::Ended {
        CallPresence::Unknown
    } else {
        current
    }
}

#[derive(Default)]
struct BoundPresence {
    current: CallPresence,
    alternate_active: bool,
}

impl BoundPresence {
    fn observe_bound(&mut self, presence: CallPresence) {
        if self.current != CallPresence::Active {
            self.current = presence;
        }
    }

    fn observe_active(&mut self, same_meeting: bool, different_source: bool) {
        if same_meeting {
            self.current = CallPresence::Active;
        } else {
            // Keep this evidence until enumeration ends, regardless of order.
            self.alternate_active |= different_source;
        }
    }

    fn finish(&self) -> CallPresence {
        replacement_presence(self.current, self.alternate_active)
    }
}

fn candidate_from_process_lookup<T>(
    lookup: Result<Option<T>, ()>,
    original_exited: bool,
    presence: &mut CallPresence,
) -> Option<T> {
    match lookup {
        Ok(candidate) => candidate,
        Err(()) => {
            *presence = replacement_presence(*presence, original_exited);
            None
        }
    }
}

pub(super) fn scan_calls(bound: Option<&CallSource>) -> CallScan {
    let mut scan = CallScan::default();
    let original_exited = bound.is_some_and(|s| unsafe {
        WaitForSingleObject(HANDLE(s.handle.process.0 as _), 0) == WAIT_OBJECT_0
    });
    // Every COM interface is created, used and dropped on this blocking thread.
    if unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_err() {
        return scan;
    }
    let _apartment = ComApartment;
    let Ok(automation) = (unsafe {
        CoCreateInstance::<_, IUIAutomation>(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)
    }) else {
        return scan;
    };
    let Ok(options) = automation.cast::<IUIAutomation2>() else {
        return scan;
    };
    if unsafe {
        options
            .SetConnectionTimeout(500)
            .and_then(|_| options.SetTransactionTimeout(500))
    }
    .is_err()
    {
        return scan;
    }
    let Ok(walker) = (unsafe { automation.ControlViewWalker() }) else {
        return scan;
    };
    let mut windows = Vec::<HWND>::new();
    if unsafe {
        EnumWindows(
            Some(collect_window),
            LPARAM((&mut windows as *mut Vec<HWND>) as isize),
        )
    }
    .is_err()
    {
        return scan;
    }
    if original_exited && windows.len() < 128 {
        scan.bound_presence = CallPresence::Ended;
    }
    let mut presence = BoundPresence {
        current: scan.bound_presence,
        ..Default::default()
    };
    let deadline = Instant::now() + Duration::from_secs(2);
    for hwnd in windows {
        if Instant::now() >= deadline {
            if presence.current != CallPresence::Active {
                presence.current = CallPresence::Unknown;
            }
            break;
        }
        let lookup = match process_info(hwnd) {
            // A window closed after enumeration cannot host a rejoining call.
            Err(()) if !unsafe { IsWindow(Some(hwnd)) }.as_bool() => Ok(None),
            result => result,
        };
        let Some((process, app, identity)) =
            candidate_from_process_lookup(lookup, original_exited, &mut presence.current)
        else {
            continue;
        };
        let possibly_rejoined = original_exited
            && bound.is_some_and(|source| {
                app == Some(source.handle.app)
                    || (app.is_none() && source.handle.app == CallApp::Meet)
            });
        presence.current = replacement_presence(presence.current, possibly_rejoined);
        if !unsafe { IsWindowVisible(hwnd) }.as_bool() || unsafe { IsIconic(hwnd) }.as_bool() {
            continue;
        }
        let Ok(root) = (unsafe { automation.ElementFromHandle(hwnd) }) else {
            continue;
        };
        let mut budget = 256;
        let calls = match app {
            Some(app) => vec![(
                app,
                String::new(),
                controls(&walker, root, app, &mut budget, deadline),
            )],
            None => meet_documents(&walker, root, &mut budget, deadline),
        };
        for (app, call_id, controls) in calls {
            let id = format!("windows:{identity}:{}:{call_id}", hwnd.0 as isize);
            if bound.is_some_and(|source| source.id == id) {
                presence.observe_bound(controls.presence());
            }
            if controls.presence() == CallPresence::Active {
                if let Some(source) = bound.filter(|source| source.handle.app == app) {
                    // Same-call rejoin is authoritative; a different call cannot
                    // be silently rebound and vetoes Ended after the entire scan.
                    presence.observe_active(
                        app == CallApp::Meet && source.handle.call_id == call_id,
                        source.id != id,
                    );
                }
                scan.candidates.push(CallSource {
                    id,
                    label: app.label().to_string(),
                    handle: SourceHandle {
                        process: process.clone(),
                        app,
                        call_id,
                    },
                });
            }
        }
    }
    scan.bound_presence = presence.finish();
    scan
}

unsafe extern "system" fn collect_window(hwnd: HWND, data: LPARAM) -> windows::core::BOOL {
    // EnumWindows invokes this synchronously while the Vec remains alive.
    let windows = unsafe { &mut *(data.0 as *mut Vec<HWND>) };
    if windows.len() < 128 {
        windows.push(hwnd);
    }
    true.into()
}

fn process_info(hwnd: HWND) -> Result<Option<(Arc<ProcessHandle>, Option<CallApp>, String)>, ()> {
    let mut pid = 0;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    let synchronized = unsafe {
        OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
            false,
            pid,
        )
    }
    .ok();
    // Unrelated processes need only enough access to identify their executable.
    // Retry without SYNCHRONIZE so protected system windows do not create false
    // uncertainty when Windows still permits their identity to be read.
    let handle = synchronized
        .or_else(|| unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok())
        .ok_or(())?;
    let process = Arc::new(ProcessHandle(handle.0 as isize));
    let mut path = [0u16; 1024];
    let mut len = path.len() as u32;
    unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(path.as_mut_ptr()),
            &mut len,
        )
    }
    .map_err(|_| ())?;
    let path = String::from_utf16_lossy(&path[..len as usize]).to_ascii_lowercase();
    let name = path.rsplit('\\').next().ok_or(())?;
    let app = match name {
        "zoom.exe" => Some(CallApp::Zoom),
        "ms-teams.exe" | "teams.exe" => Some(CallApp::Teams),
        "chrome.exe" | "msedge.exe" | "firefox.exe" | "brave.exe" => None,
        _ => return Ok(None),
    };
    // A candidate must retain an exit-tracking handle for a stable call identity.
    if synchronized.is_none() {
        return Err(());
    }
    let (mut created, mut exited, mut kernel, mut user) = (
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
    );
    unsafe { GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) }
        .map_err(|_| ())?;
    let created = (u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime);
    Ok(Some((process, app, format!("{pid}:{created}"))))
}

fn children(
    walker: &IUIAutomationTreeWalker,
    node: &IUIAutomationElement,
    queue: &mut VecDeque<IUIAutomationElement>,
    budget: usize,
    deadline: Instant,
) -> bool {
    let mut child = related(walker, node, true);
    while let Ok(Some(element)) = child {
        if queue.len() >= budget || Instant::now() >= deadline {
            return false;
        }
        child = related(walker, &element, false);
        queue.push_back(element);
    }
    child.is_ok()
}

fn related(
    walker: &IUIAutomationTreeWalker,
    node: &IUIAutomationElement,
    first: bool,
) -> windows::core::Result<Option<IUIAutomationElement>> {
    // The generated Result<Element> maps successful null (no child/sibling)
    // to an error. Preserve that distinction so provider failures veto Ended.
    let mut raw = std::ptr::null_mut();
    unsafe {
        let method = if first {
            walker.vtable().GetFirstChildElement
        } else {
            walker.vtable().GetNextSiblingElement
        };
        method(walker.as_raw(), node.as_raw(), &mut raw).ok()?;
        Ok(if raw.is_null() {
            None
        } else {
            Some(IUIAutomationElement::from_raw(raw))
        })
    }
}

fn visible(node: &IUIAutomationElement) -> windows::core::Result<bool> {
    unsafe {
        if node.CurrentIsOffscreen()?.as_bool() {
            return Ok(false);
        }
        let bounds = node.CurrentBoundingRectangle()?;
        Ok(bounds.right > bounds.left && bounds.bottom > bounds.top)
    }
}

fn controls(
    walker: &IUIAutomationTreeWalker,
    root: IUIAutomationElement,
    app: CallApp,
    budget: &mut usize,
    deadline: Instant,
) -> Controls {
    let mut found = Controls::default();
    let mut queue = VecDeque::from([root]);
    while let Some(node) = queue.pop_front() {
        if *budget == 0 || Instant::now() >= deadline {
            found.incomplete = true;
            break;
        }
        *budget -= 1;
        match visible(&node) {
            Ok(true) => {}
            Ok(false) => continue,
            Err(_) => {
                found.incomplete = true;
                continue;
            }
        }
        let Ok(kind) = (unsafe { node.CurrentControlType() }) else {
            found.incomplete = true;
            continue;
        };
        if kind == UIA_ButtonControlTypeId {
            match unsafe { node.CurrentIsEnabled() } {
                Ok(enabled) if enabled.as_bool() => match unsafe { node.CurrentName() } {
                    Ok(label) => found.observe(app, &label.to_string()),
                    Err(_) => found.incomplete = true,
                },
                Ok(_) => {}
                Err(_) => found.incomplete = true,
            }
        } else if kind == UIA_TextControlTypeId {
            let Ok(level) = node
                .cast::<IUIAutomationElement8>()
                .and_then(|heading| unsafe { heading.CurrentHeadingLevel() })
            else {
                found.incomplete = true;
                continue;
            };
            if !(HeadingLevel1.0..=HeadingLevel9.0).contains(&level.0) {
                continue;
            }
            // Heading metadata avoids reading chat, text inputs or page body text.
            match unsafe { node.CurrentName() } {
                Ok(label) => {
                    let label = label.to_string();
                    found.ended_heading |= ended_heading(&label);
                    found.interrupted |= interrupted_heading(&label);
                }
                Err(_) => found.incomplete = true,
            }
        } else if app == CallApp::Teams
            && (kind == UIA_GroupControlTypeId || kind == UIA_ToolBarControlTypeId)
        {
            if let Ok(label) = unsafe { node.CurrentName() } {
                found.teams_surface |= matches!(
                    label.to_string().trim().to_lowercase().as_str(),
                    "meeting controls"
                        | "calling controls"
                        | "controles de reunión"
                        | "controles de llamada"
                );
            } else {
                found.incomplete = true;
            }
        }
        found.incomplete |= !children(walker, &node, &mut queue, *budget, deadline);
    }
    found
}

fn meet_documents(
    walker: &IUIAutomationTreeWalker,
    root: IUIAutomationElement,
    budget: &mut usize,
    deadline: Instant,
) -> Vec<(CallApp, String, Controls)> {
    let mut calls = Vec::new();
    let mut complete = true;
    let mut queue = VecDeque::from([root]);
    while let Some(node) = queue.pop_front() {
        if *budget == 0 || Instant::now() >= deadline {
            complete = false;
            break;
        }
        *budget -= 1;
        match visible(&node) {
            Ok(true) => {}
            Ok(false) => continue,
            Err(_) => {
                complete = false;
                continue;
            }
        }
        let Ok(kind) = (unsafe { node.CurrentControlType() }) else {
            complete = false;
            continue;
        };
        if kind == UIA_DocumentControlTypeId {
            // Chromium's document legacy-accessible value exposes its URL;
            // no address-bar text, browsing history, or page/chat text is read.
            let value = unsafe {
                node.GetCurrentPatternAs::<IUIAutomationLegacyIAccessiblePattern>(
                    UIA_LegacyIAccessiblePatternId,
                )
                .and_then(|pattern| pattern.CurrentValue())
            };
            complete &= value.is_ok();
            if let Some(id) = value
                .ok()
                .and_then(|value| meet_call_id(&value.to_string()))
            {
                let found = controls(walker, node, CallApp::Meet, budget, deadline);
                calls.push((CallApp::Meet, id, found));
            }
            continue;
        }
        complete &= children(walker, &node, &mut queue, *budget, deadline);
    }
    for (_, _, controls) in &mut calls {
        controls.incomplete |= !complete;
    }
    calls
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alternate_active_call_veto_is_independent_of_window_order() {
        for alternate_first in [true, false] {
            let mut presence = BoundPresence::default();
            if alternate_first {
                presence.observe_active(false, true);
            }
            presence.observe_bound(CallPresence::Ended);
            if !alternate_first {
                presence.observe_active(false, true);
            }
            assert_eq!(presence.finish(), CallPresence::Unknown);
        }
    }

    #[test]
    fn same_meeting_rejoin_and_bound_active_evidence_survive_any_window_order() {
        for active_first in [true, false] {
            for rejoined in [true, false] {
                let mut presence = BoundPresence::default();
                if active_first {
                    if rejoined {
                        presence.observe_active(true, true);
                    } else {
                        presence.observe_bound(CallPresence::Active);
                    }
                }
                presence.observe_bound(CallPresence::Ended);
                presence.observe_active(false, true);
                if !active_first {
                    if rejoined {
                        presence.observe_active(true, true);
                    } else {
                        presence.observe_bound(CallPresence::Active);
                    }
                }
                assert_eq!(presence.finish(), CallPresence::Active);
            }
        }
    }

    #[test]
    fn unreadable_process_identity_after_exit_is_uncertain_but_known_unrelated_is_not() {
        let mut presence = CallPresence::Ended;
        assert!(candidate_from_process_lookup::<()>(Ok(None), true, &mut presence).is_none());
        assert_eq!(presence, CallPresence::Ended);
        assert!(candidate_from_process_lookup::<()>(Err(()), true, &mut presence).is_none());
        assert_eq!(presence, CallPresence::Unknown);

        presence = CallPresence::Active;
        assert!(candidate_from_process_lookup::<()>(Err(()), true, &mut presence).is_none());
        assert_eq!(presence, CallPresence::Active);
        assert_eq!(
            candidate_from_process_lookup(Ok(Some("candidate")), true, &mut presence),
            Some("candidate")
        );
    }

    #[test]
    fn missing_controls_and_mute_are_unknown() {
        let mut controls = Controls::default();
        for name in ["Mute", "Unmute", "Join now", "Turn on microphone"] {
            controls.observe(CallApp::Meet, name);
        }
        assert_eq!(controls.presence(), CallPresence::Unknown);
    }

    #[test]
    fn meet_requires_postcall_heading_and_active_wins_on_rejoin() {
        let mut controls = Controls::default();
        controls.observe(CallApp::Meet, "Rejoin");
        assert_eq!(controls.presence(), CallPresence::Unknown);
        controls.observe(CallApp::Meet, "Return to home screen");
        assert_eq!(controls.presence(), CallPresence::Unknown);
        controls.ended_heading = true;
        assert_eq!(controls.presence(), CallPresence::Ended);
        controls.observe(CallApp::Meet, "Leave call");
        assert_eq!(controls.presence(), CallPresence::Active);
    }

    #[test]
    fn unrelated_postcall_controls_never_end_desktop_calls() {
        for app in [CallApp::Zoom, CallApp::Teams] {
            let mut controls = Controls::default();
            controls.observe(app, "Rejoin");
            controls.observe(app, "Return to home screen");
            assert_eq!(controls.presence(), CallPresence::Unknown);
        }
    }

    #[test]
    fn teams_leave_requires_meeting_surface() {
        let mut controls = Controls::default();
        controls.observe(CallApp::Teams, "Leave");
        assert_eq!(controls.presence(), CallPresence::Unknown);
        controls.teams_surface = true;
        assert_eq!(controls.presence(), CallPresence::Active);
    }

    #[test]
    fn interrupted_or_incomplete_postcall_ui_is_unknown() {
        let mut controls = Controls {
            return_control: true,
            ended_heading: true,
            ..Controls::default()
        };
        controls.interrupted = true;
        assert_eq!(controls.presence(), CallPresence::Unknown);
        controls.interrupted = false;
        controls.incomplete = true;
        assert_eq!(controls.presence(), CallPresence::Unknown);
        controls.observe(CallApp::Meet, "Leave call");
        assert_eq!(controls.presence(), CallPresence::Active);
    }

    #[test]
    fn process_exit_with_unconfirmed_replacement_never_stops_rejoining_call() {
        assert_eq!(
            replacement_presence(CallPresence::Ended, true),
            CallPresence::Unknown
        );
        assert_eq!(
            replacement_presence(CallPresence::Ended, false),
            CallPresence::Ended
        );
        assert_eq!(
            replacement_presence(CallPresence::Active, true),
            CallPresence::Active
        );
    }
}
