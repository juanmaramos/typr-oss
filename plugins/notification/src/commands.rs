use crate::NotificationPluginExt;

#[tauri::command]
#[specta::specta]
pub(crate) async fn open_call_detection_settings() -> Result<(), String> {
    typr_detect::open_call_detection_settings()
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_event_notification<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<bool, String> {
    app.get_event_notification().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn set_event_notification<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    enabled: bool,
) -> Result<(), String> {
    app.set_event_notification(enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_detect_notification<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<bool, String> {
    app.get_detect_notification().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn set_detect_notification<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    enabled: bool,
) -> Result<(), String> {
    app.set_detect_notification(enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn open_notification_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    app.open_notification_settings().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn request_notification_permission<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    app.request_notification_permission()
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn check_notification_permission<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<typr_notification2::NotificationPermission, String> {
    let permission = app
        .check_notification_permission()
        .await
        .map_err(|e| e.to_string())?;
    Ok(permission)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn start_detect_notification<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    app.start_detect_notification().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn stop_detect_notification<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    app.stop_detect_notification().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn start_event_notification<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    app.start_event_notification()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn stop_event_notification<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    app.stop_event_notification().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_call_end_enabled<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<bool, String> {
    Ok(crate::call_end::enabled(&app).await)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn set_call_end_enabled<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    enabled: bool,
) -> Result<(), String> {
    crate::call_end::set_enabled(&app, enabled).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_call_end_status<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<crate::call_end::CallEndStatus, String> {
    Ok(crate::call_end::status(&app).await)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn associate_call<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    session_id: String,
    source_id: Option<String>,
) -> Result<(), String> {
    crate::call_end::associate(&app, &session_id, source_id).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn keep_recording<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    session_id: String,
) -> Result<(), String> {
    crate::call_end::associate(&app, &session_id, None).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn stop_associated_recording<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    session_id: String,
) -> Result<(), String> {
    crate::call_end::stop(&app, &session_id).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn show_call_end_notification<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    session_id: String,
    title: String,
    message: String,
) -> Result<(), String> {
    crate::call_end::show_notification(&app, &session_id, title, message).await
}
