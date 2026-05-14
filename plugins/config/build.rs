const COMMANDS: &[&str] = &[
    "get_general_config",
    "set_general_config",
    "get_notification_config",
    "set_notification_config",
    "get_ai_config",
    "set_ai_config",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
