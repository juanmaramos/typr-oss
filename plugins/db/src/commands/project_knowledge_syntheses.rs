#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn upsert_project_knowledge_synthesis(
    state: tauri::State<'_, crate::ManagedState>,
    synthesis: typr_db_user::ProjectKnowledgeSynthesis,
) -> Result<typr_db_user::ProjectKnowledgeSynthesis, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.upsert_project_knowledge_synthesis(synthesis)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn get_project_knowledge_synthesis(
    state: tauri::State<'_, crate::ManagedState>,
    project_id: String,
) -> Result<Option<typr_db_user::ProjectKnowledgeSynthesis>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.get_project_knowledge_synthesis(project_id)
        .await
        .map_err(|e| e.to_string())
}
