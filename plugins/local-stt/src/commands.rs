use tauri::ipc::Channel;
use tauri_specta::Event;

use crate::LocalSttPluginExt;

#[tauri::command]
#[specta::specta]
pub async fn models_dir<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    Ok(app.models_dir().to_string_lossy().to_string())
}

#[tauri::command]
#[specta::specta]
pub fn list_ggml_backends<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Vec<typr_whisper_local::GgmlBackend> {
    app.list_ggml_backends()
}

#[tauri::command]
#[specta::specta]
pub async fn list_supported_models() -> Result<Vec<crate::SupportedModel>, String> {
    Ok(crate::SUPPORTED_MODELS.to_vec())
}

#[tauri::command]
#[specta::specta]
pub async fn is_server_running<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> bool {
    app.is_server_running().await
}

#[tauri::command]
#[specta::specta]
pub async fn is_model_downloaded<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: crate::SupportedModel,
) -> Result<bool, String> {
    app.is_model_downloaded(&model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn is_model_downloading<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: crate::SupportedModel,
) -> Result<bool, String> {
    Ok(app.is_model_downloading(&model).await)
}

#[tauri::command]
#[specta::specta]
pub async fn download_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: crate::SupportedModel,
    channel: Channel<i8>,
) -> Result<(), String> {
    app.download_model(model, Some(channel))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn download_model_background<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: crate::SupportedModel,
) -> Result<(), String> {
    app.download_model(model, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_current_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<crate::SupportedModel, String> {
    app.get_current_model().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn set_current_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: crate::SupportedModel,
) -> Result<(), String> {
    app.set_current_model(model).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn start_server<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    app.start_server().await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn stop_server<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    app.stop_server().await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn restart_server<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    app.stop_server().await.map_err(|e| e.to_string())?;
    app.start_server().await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn process_recorded<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    audio_path: String,
) -> Result<(), String> {
    let models_dir = app.models_dir();
    let current_model = app.get_current_model().map_err(|e| e.to_string())?;
    let mut model_path = models_dir.join(current_model.file_name());

    // If the selected model isn't downloaded, find any available downloaded model
    if !model_path.exists() {
        tracing::warn!(
            "[PROCESS_RECORDED] Selected model {:?} not found at {:?}, scanning for alternatives",
            current_model,
            model_path
        );
        let mut found = false;
        for candidate in crate::SUPPORTED_MODELS {
            let candidate_path = models_dir.join(candidate.file_name());
            if candidate_path.exists() {
                tracing::info!(
                    "[PROCESS_RECORDED] Using fallback model {:?} at {:?}",
                    candidate,
                    candidate_path
                );
                model_path = candidate_path;
                found = true;
                break;
            }
        }
        if !found {
            return Err(
                "No local STT model downloaded. Download one in Settings → AI.".to_string(),
            );
        }
    }

    tracing::info!(
        "[PROCESS_RECORDED] Processing {:?} with model {:?}",
        audio_path,
        model_path
    );

    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let app_clone_inner = app_clone.clone();
        app_clone
            .process_recorded(model_path, audio_path, move |event| {
                let _ = event.emit(&app_clone_inner);
            })
            .map(|_| ())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r)
}
