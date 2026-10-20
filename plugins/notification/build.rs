const COMMANDS: &[&str] = &[
    "open_call_detection_settings",
    "show_call_end_notification",
    "get_call_end_enabled",
    "set_call_end_enabled",
    "get_call_end_status",
    "associate_call",
    "keep_recording",
    "stop_associated_recording",
    "get_event_notification",
    "set_event_notification",
    "get_detect_notification",
    "set_detect_notification",
    "open_notification_settings",
    "request_notification_permission",
    "check_notification_permission",
    "start_detect_notification",
    "stop_detect_notification",
    "start_event_notification",
    "stop_event_notification",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
