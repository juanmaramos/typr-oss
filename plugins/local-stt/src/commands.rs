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
pub fn list_model_capabilities<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Vec<crate::ModelCapabilities> {
    let nemotron_available = crate::streaming::WorkerPaths::resolve(&app).is_ok();
    crate::SUPPORTED_MODELS
        .iter()
        .map(|model| crate::ModelCapabilities {
            model: model.clone(),
            backend: model.backend(),
            size_bytes: model.model_size(),
            realtime: model.backend() == crate::SttBackend::NemotronStreaming,
            recorded: model.backend() == crate::SttBackend::Whisper,
            available: model.backend() == crate::SttBackend::Whisper || nemotron_available,
            supported_languages: model.supported_languages(),
            supported_locales: model.supported_locales(),
            live_fallback_models: model.live_fallback_models().to_vec(),
            recorded_fallback_models: model.recorded_fallback_models().to_vec(),
        })
        .collect()
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
    let current_model = app.get_current_model().map_err(|e| e.to_string())?;
    let model = resolve_recorded_model(current_model, |candidate| {
        let app = &app;
        async move {
            app.is_model_downloaded(&candidate)
                .await
                .map_err(|error| error.to_string())
        }
    })
    .await?;
    let model_path = app.models_dir().join(model.file_name());

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

// Availability is validated by the native artifact check, not file existence:
// an in-progress or truncated selected file must not enter the decoder.
async fn resolve_recorded_model<F, Fut>(
    selected: crate::SupportedModel,
    mut is_downloaded: F,
) -> Result<crate::SupportedModel, String>
where
    F: FnMut(crate::SupportedModel) -> Fut,
    Fut: std::future::Future<Output = Result<bool, String>>,
{
    if selected.backend() == crate::SttBackend::Whisper && is_downloaded(selected.clone()).await? {
        return Ok(selected);
    }
    for candidate in selected.recorded_fallback_models() {
        if is_downloaded(candidate.clone()).await? {
            return Ok(candidate.clone());
        }
    }
    Err("No local STT model downloaded. Download one in Settings → AI.".to_string())
}

#[cfg(test)]
mod capability_tests {
    #[tokio::test]
    async fn invalid_selected_whisper_uses_validated_fallback_in_native_order() {
        use crate::SupportedModel;
        let mut checked = Vec::new();
        let selected = SupportedModel::QuantizedBaseEn;
        // A partial selected artifact is not downloaded even though its path exists.
        let resolved = super::resolve_recorded_model(selected.clone(), |candidate| {
            checked.push(candidate.clone());
            std::future::ready(Ok(candidate == SupportedModel::QuantizedSmall))
        })
        .await
        .unwrap();
        assert_eq!(resolved, SupportedModel::QuantizedSmall);
        assert_eq!(
            checked,
            vec![
                selected,
                SupportedModel::QuantizedLargeTurbo,
                SupportedModel::QuantizedSmall
            ]
        );
    }

    #[tokio::test]
    async fn valid_explicit_whisper_selection_takes_precedence_and_missing_artifacts_fail() {
        let selected = crate::SupportedModel::DistilLargeV35En;
        let mut checked = Vec::new();
        let resolved = super::resolve_recorded_model(selected.clone(), |candidate| {
            checked.push(candidate);
            std::future::ready(Ok(true))
        })
        .await
        .unwrap();
        assert_eq!(resolved, selected);
        assert_eq!(checked, vec![selected]);
        assert!(
            super::resolve_recorded_model(crate::SupportedModel::Nemotron3p5Streaming, |_| {
                std::future::ready(Ok(false))
            })
            .await
            .is_err()
        );
    }

    #[test]
    fn advertised_fallbacks_match_the_native_live_and_recorded_policies() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let capabilities = super::list_model_capabilities(app.handle().clone());
        assert_eq!(capabilities.len(), crate::SUPPORTED_MODELS.len());
        for capability in capabilities {
            assert_eq!(
                capability.recorded_fallback_models.as_slice(),
                crate::STREAMING_WHISPER_FALLBACKS
            );
            if capability.model == crate::SupportedModel::Nemotron3p5Streaming {
                assert_eq!(
                    capability.live_fallback_models.as_slice(),
                    crate::STREAMING_WHISPER_FALLBACKS
                );
            } else {
                assert!(capability.live_fallback_models.is_empty());
            }
        }
    }
}
