//! Read-only, call-scoped evidence. Missing controls, microphone inactivity and
//! inaccessible windows never establish that a call ended.

#[cfg(target_os = "macos")]
mod macos;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum CallPresence {
    Active,
    Ended,
    #[default]
    Unknown,
}

#[derive(Clone)]
pub struct CallSource {
    pub id: String,
    pub label: String,
    #[cfg(target_os = "macos")]
    handle: macos::SourceHandle,
}

impl std::fmt::Debug for CallSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CallSource")
            .field("id", &self.id)
            .field("label", &self.label)
            .finish_non_exhaustive()
    }
}

#[derive(Clone, Debug, Default)]
pub struct CallScan {
    pub candidates: Vec<CallSource>,
    pub bound_presence: CallPresence,
}

/// A live, read-only check. Windows call detection has no Accessibility grant.
pub fn call_detection_permission_granted() -> bool {
    #[cfg(target_os = "macos")]
    {
        cidre::ax::is_process_trusted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Only called after the user chooses to configure call detection.
pub fn open_call_detection_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        crate::Detector::default().macos_request_accessibility_permission()?;
        let url = cidre::ns::Url::with_str(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        )
        .expect("valid Accessibility settings URL");
        if !cidre::ns::Workspace::shared().open_url(&url) {
            return Err("Could not open Accessibility settings".to_string());
        }
    }
    Ok(())
}

/// Call from a blocking worker. Does not request permissions, focus windows,
/// run scripts, or read meeting text/chat. Unsupported/unreadable state is unknown.
pub fn scan_calls(bound: Option<&CallSource>) -> CallScan {
    #[cfg(target_os = "macos")]
    {
        macos::scan_calls(bound)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = bound;
        CallScan::default()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum CallApp {
    Zoom,
    Teams,
    Meet,
}

impl CallApp {
    fn label(self) -> &'static str {
        match self {
            Self::Zoom => "Zoom",
            Self::Teams => "Microsoft Teams",
            Self::Meet => "Google Meet",
        }
    }
}

/// Match exact accessible control labels, never arbitrary page text or mute state.
/// The English controls follow Anarlog's bounded active-call classification;
/// Spanish equivalents cover Typr's supported interface languages.
pub(super) fn active_control(app: CallApp, label: &str) -> bool {
    let label = label.trim().to_lowercase();
    match app {
        CallApp::Zoom => matches!(
            label.as_str(),
            "leave"
                | "leave meeting"
                | "end meeting"
                | "salir"
                | "salir de la reunión"
                | "finalizar reunión"
        ),
        CallApp::Teams => matches!(label.as_str(), "hang up" | "colgar"),
        CallApp::Meet => matches!(
            label.as_str(),
            "leave call" | "salir de la llamada" | "abandonar la llamada"
        ),
    }
}

pub(super) fn ended_heading(label: &str) -> bool {
    matches!(
        label.trim().to_lowercase().as_str(),
        "you left the meeting"
            | "you've left the meeting"
            | "the meeting has ended"
            | "meeting ended"
            | "your call has ended"
            | "has salido de la reunión"
            | "la reunión ha finalizado"
            | "la llamada ha finalizado"
    )
}

pub(super) fn return_control(label: &str) -> bool {
    matches!(
        label.trim().to_lowercase().as_str(),
        "rejoin"
            | "rejoin meeting"
            | "return to home screen"
            | "volver a unirse"
            | "volver a la pantalla de inicio"
    )
}

pub(super) fn interrupted_heading(label: &str) -> bool {
    matches!(
        label.trim().to_lowercase().as_str(),
        "reconnecting"
            | "trying to reconnect"
            | "you lost your network connection"
            | "reconectando"
            | "intentando volver a conectar"
    )
}

/// Only a validated Meet document URL is a browser call identity. Queries and
/// fragments (which may contain personal tokens) are intentionally discarded.
pub(super) fn meet_call_id(value: &str) -> Option<String> {
    let url = url::Url::parse(value).ok()?;
    if url.scheme() != "https" || url.host_str() != Some("meet.google.com") {
        return None;
    }
    let code = url.path().strip_prefix('/')?;
    let bytes = code.as_bytes();
    (bytes.len() == 12
        && bytes[3] == b'-'
        && bytes[8] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(i, b)| i == 3 || i == 8 || b.is_ascii_lowercase()))
    .then(|| code.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mute_and_generic_browser_controls_never_establish_active_call() {
        for app in [CallApp::Zoom, CallApp::Teams, CallApp::Meet] {
            for label in [
                "Mute",
                "Unmute",
                "Turn on microphone",
                "Join",
                "End",
                "Meeting chat",
                "Leave call to action",
            ] {
                assert!(!active_control(app, label));
            }
        }
        assert!(active_control(CallApp::Zoom, "Leave meeting"));
        assert!(active_control(CallApp::Teams, "Hang up"));
        assert!(active_control(CallApp::Meet, "Leave call"));
    }

    #[test]
    fn meet_identity_is_exact_and_drops_personal_parameters() {
        assert_eq!(
            meet_call_id("https://meet.google.com/abc-defg-hij?authuser=1#private"),
            Some("abc-defg-hij".into())
        );
        for url in [
            "https://meet.google.com/",
            "https://meet.google.com.evil.test/abc-defg-hij",
            "http://meet.google.com/abc-defg-hij",
            "https://meet.google.com/landing",
            "https://meet.google.com/abc-defg-hij/other",
        ] {
            assert!(meet_call_id(url).is_none());
        }
    }
}
