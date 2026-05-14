#[cfg(target_os = "macos")]
use swift_rs::{swift, Bool, SRString};

#[cfg(target_os = "macos")]
swift!(fn _audio_capture_permission_granted() -> Bool);

#[cfg(target_os = "macos")]
swift!(fn _reset_audio_capture_permission(bundle_id: SRString) -> Bool);

#[cfg(target_os = "macos")]
swift!(fn _reset_microphone_permission(bundle_id: SRString) -> Bool);

pub fn audio_capture_permission_granted() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        _audio_capture_permission_granted()
    }

    #[cfg(target_os = "windows")]
    {
        // Windows: System audio capture via WASAPI loopback doesn't require explicit permissions
        // This is built into Windows audio architecture (same as macOS BlackHole/ScreenCaptureKit)
        // Note: Microphone access is checked separately via standard audio device enumeration
        tracing::debug!("Windows system audio capture available via WASAPI loopback");
        true
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    true
}

#[cfg(target_os = "macos")]
pub fn reset_audio_capture_permission(bundle_id: impl Into<SRString>) -> bool {
    unsafe { _reset_audio_capture_permission(bundle_id.into()) }
}

#[cfg(not(target_os = "macos"))]
pub fn reset_audio_capture_permission(bundle_id: impl Into<String>) -> bool {
    true
}

#[cfg(target_os = "macos")]
pub fn reset_microphone_permission(bundle_id: impl Into<SRString>) -> bool {
    unsafe { _reset_microphone_permission(bundle_id.into()) }
}

#[cfg(not(target_os = "macos"))]
pub fn reset_microphone_permission(bundle_id: impl Into<String>) -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_capture_permission_granted() {
        #[cfg(target_os = "macos")]
        let result = audio_capture_permission_granted();

        #[cfg(not(target_os = "macos"))]
        let result = audio_capture_permission_granted();

        assert!(result);
    }

    #[test]
    fn test_reset_audio_capture_permission() {
        #[cfg(target_os = "macos")]
        let result = reset_audio_capture_permission("com.typr.nightly");
        println!("reset_audio_capture_permission: {}", result);
    }

    #[test]
    fn test_reset_microphone_permission() {
        #[cfg(target_os = "macos")]
        let result = reset_microphone_permission("com.typr.nightly");
        println!("reset_microphone_permission: {}", result);
    }
}
