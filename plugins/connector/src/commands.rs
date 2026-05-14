use crate::{AiTaskDefaults, Connection, ConnectionLLM, ConnectionSTT, ConnectorPluginExt, StoreKey};
use typr_listener_interface::Word;

#[tauri::command]
#[specta::specta]
pub async fn list_custom_llm_models<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<String>, String> {
    app.list_custom_llm_models()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_custom_llm_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    app.get_custom_llm_model().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_custom_llm_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: String,
) -> Result<(), String> {
    app.set_custom_llm_model(model).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_custom_llm_enabled<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<bool, String> {
    app.get_custom_llm_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_custom_llm_enabled<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    enabled: bool,
) -> Result<(), String> {
    app.set_custom_llm_enabled(enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_custom_llm_connection<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<Connection>, String> {
    app.get_custom_llm_connection().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_custom_llm_connection<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    connection: Connection,
) -> Result<(), String> {
    app.set_custom_llm_connection(connection)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_local_llm_connection<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<ConnectionLLM, String> {
    app.get_local_llm_connection()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_llm_connection<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<ConnectionLLM, String> {
    app.get_llm_connection().await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_stt_connection<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<ConnectionSTT, String> {
    app.get_stt_connection().await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_openai_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::OpenaiApiKey)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn get_openrouter_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::OpenrouterApiKey)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn get_groq_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::GroqApiKey)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn get_gemini_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::GeminiApiKey)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn set_openai_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    api_key: String,
) -> Result<(), String> {
    app.connector_store()
        .set(StoreKey::OpenaiApiKey, api_key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_openrouter_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    api_key: String,
) -> Result<(), String> {
    app.connector_store()
        .set(StoreKey::OpenrouterApiKey, api_key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_groq_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    api_key: String,
) -> Result<(), String> {
    app.connector_store()
        .set(StoreKey::GroqApiKey, api_key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_gemini_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    api_key: String,
) -> Result<(), String> {
    app.connector_store()
        .set(StoreKey::GeminiApiKey, api_key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_provider_source<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::ProviderSource)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn set_provider_source<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    source: String,
) -> Result<(), String> {
    app.connector_store()
        .set(StoreKey::ProviderSource, source)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_others_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::OthersApiKey)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn set_others_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    api_key: String,
) -> Result<(), String> {
    app.connector_store()
        .set(StoreKey::OthersApiKey, api_key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_others_api_base<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::OthersApiBase)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn set_others_api_base<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    api_base: String,
) -> Result<(), String> {
    app.connector_store()
        .set(StoreKey::OthersApiBase, api_base)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_others_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::OthersModel)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn set_others_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: String,
) -> Result<(), String> {
    app.connector_store()
        .set(StoreKey::OthersModel, model)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_openai_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: String,
) -> Result<(), String> {
    app.connector_store()
        .set(StoreKey::OpenaiModel, model)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_openai_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::OpenaiModel)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn set_gemini_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: String,
) -> Result<(), String> {
    app.connector_store()
        .set(StoreKey::GeminiModel, model)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_gemini_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::GeminiModel)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn set_openrouter_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: String,
) -> Result<(), String> {
    app.connector_store()
        .set(StoreKey::OpenrouterModel, model)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_openrouter_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::OpenrouterModel)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn get_assemblyai_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::AssemblyaiApiKey)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn set_assemblyai_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    api_key: String,
) -> Result<(), String> {
    app.connector_store()
        .set(StoreKey::AssemblyaiApiKey, api_key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_stt_model<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::SttModel)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn set_stt_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: String,
) -> Result<(), String> {
    tracing::debug!("[SET_STT_MODEL] Called with: {}", model);
    let store = app.connector_store();
    store
        .set(StoreKey::SttModel, model.clone())
        .map_err(|e| e.to_string())?;
    store.save().map_err(|e| e.to_string())?;

    // Emit selection change event so frontend updates instantly
    use tauri::Emitter;
    let is_cloud = model.contains("assemblyai");
    let _ = app.emit(
        "stt-model-selection-changed",
        &serde_json::json!({
            "local_model": if is_cloud { serde_json::Value::Null } else { serde_json::Value::String(model.clone()) },
            "cloud_model": if is_cloud { serde_json::Value::String(model.clone()) } else { serde_json::Value::Null },
        }),
    );

    tracing::debug!("[SET_STT_MODEL] Success: {}", model);
    Ok(())
}

/// Set a transient session-level STT model override. This is NOT saved to disk.
/// Used by fallback logic to switch models mid-session without touching the user's preference.
/// Clear it with `clear_stt_model_session` when the session ends.
#[tauri::command]
#[specta::specta]
pub async fn set_stt_model_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: String,
) -> Result<(), String> {
    tracing::debug!("[SET_STT_MODEL_SESSION] Session override: {}", model);
    let store = app.connector_store();
    store
        .set(StoreKey::SttModelSession, model)
        .map_err(|e| e.to_string())?;
    // Intentionally no store.save() — this override must not persist across restarts
    Ok(())
}

/// Clear the transient session STT model override, restoring the user's persisted preference.
#[tauri::command]
#[specta::specta]
pub async fn clear_stt_model_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    tracing::debug!("[CLEAR_STT_MODEL_SESSION] Restoring user preference");
    let store = app.connector_store();
    store
        .set(StoreKey::SttModelSession, String::new())
        .map_err(|e| e.to_string())?;
    // Intentionally no store.save()
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_cloud_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let store = app.connector_store();
    let v = store
        .get::<String>(StoreKey::CloudModel)
        .map_err(|e| e.to_string())?;
    Ok(v.unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn set_cloud_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: String,
) -> Result<(), String> {
    let store = app.connector_store();
    store
        .set(StoreKey::CloudModel, model.clone())
        .map_err(|e| e.to_string())?;
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_ai_task_defaults<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<AiTaskDefaults, String> {
    let store = app.connector_store();
    let defaults = store
        .get::<AiTaskDefaults>(StoreKey::AiTaskDefaults)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    Ok(defaults)
}

#[tauri::command]
#[specta::specta]
pub async fn set_ai_task_defaults<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    defaults: AiTaskDefaults,
) -> Result<(), String> {
    let store = app.connector_store();
    store
        .set(StoreKey::AiTaskDefaults, defaults)
        .map_err(|e| e.to_string())?;
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn process_recorded_cloud<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    audio_path: String,
) -> Result<Vec<Word>, String> {
    let conn = app.get_stt_connection().await.map_err(|e| e.to_string())?;

    let (api_base, api_key) = match conn {
        ConnectionSTT::CloudProvider(Connection {
            api_base,
            api_key: Some(api_key),
        }) => (api_base, api_key),
        ConnectionSTT::CloudProvider(_) => {
            return Err("Cloud STT API key is not configured".to_string());
        }
        ConnectionSTT::TyprLocal(_) => {
            return Err("No cloud STT model selected".to_string());
        }
    };

    crate::recorded::transcribe_with_provider(&api_base, &api_key, &audio_path)
        .await
        .map_err(|e| e.to_string())
}
