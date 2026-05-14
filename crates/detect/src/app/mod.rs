#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
type PlatformDetector = macos::Detector;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
type PlatformDetector = windows::Detector;

const MEETING_APP_IDENTIFIERS: &[&str] = &[
    // macOS bundle IDs
    "us.zoom.xos",
    "cisco-systems.spark",
    "com.microsoft.teams",
    "com.microsoft.teams2",
    // Windows/Linux executable names
    "zoom",
    "zoomworkplace",
    "teams",
    "msteams",
    "ms-teams",
    "webex",
    "ciscocollabhost",
];

pub(crate) fn normalize_identifier(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .trim_end_matches(".exe")
        .to_string()
}

pub(crate) fn is_meeting_app_identifier(value: &str) -> bool {
    let normalized = normalize_identifier(value);
    MEETING_APP_IDENTIFIERS
        .iter()
        .any(|candidate| normalized == *candidate)
}

#[derive(Default)]
pub struct AppDetector {
    inner: PlatformDetector,
}

impl crate::Observer for AppDetector {
    fn start(&mut self, f: crate::DetectCallback) {
        self.inner.start(f);
    }
    fn stop(&mut self) {
        self.inner.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn meeting_identifiers_match_bundle_ids_and_executables() {
        assert!(is_meeting_app_identifier("us.zoom.xos"));
        assert!(is_meeting_app_identifier("com.microsoft.teams2"));
        assert!(is_meeting_app_identifier("Zoom.exe"));
        assert!(is_meeting_app_identifier("ms-teams.exe"));
        assert!(is_meeting_app_identifier("msteams.exe"));
        assert!(is_meeting_app_identifier("Webex"));
    }

    #[test]
    fn non_meeting_identifiers_are_rejected() {
        assert!(!is_meeting_app_identifier("com.apple.Safari"));
        assert!(!is_meeting_app_identifier("finder"));
        assert!(!is_meeting_app_identifier("slack"));
    }
}
