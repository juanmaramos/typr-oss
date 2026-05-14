const COMMANDS: &[&str] = &["render", "register_template"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
