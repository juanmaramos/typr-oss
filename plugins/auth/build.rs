const COMMANDS: &[&str] = &[
    "get_from_store",
    "set_in_store",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
