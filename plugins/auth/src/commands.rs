use crate::{store::StoreKey, AuthPluginExt};

#[tauri::command]
#[specta::specta]
pub fn set_in_store<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    key: StoreKey,
    value: String,
) -> Result<(), String> {
    app.set_in_store(key, value).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_from_store<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    key: StoreKey,
) -> Result<Option<String>, String> {
    app.get_from_store(key).map_err(|e| e.to_string())
}
