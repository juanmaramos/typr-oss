#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state, chunks))]
pub async fn replace_project_source_chunks(
    state: tauri::State<'_, crate::ManagedState>,
    project_id: String,
    source_type: String,
    source_id: String,
    chunks: Vec<typr_db_user::ProjectSourceChunk>,
) -> Result<Vec<typr_db_user::ProjectSourceChunk>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.replace_project_source_chunks(project_id, source_type, source_id, chunks)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_project_source_chunks(
    state: tauri::State<'_, crate::ManagedState>,
    project_id: String,
) -> Result<Vec<typr_db_user::ProjectSourceChunk>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_project_source_chunks(project_id)
        .await
        .map_err(|e| e.to_string())
}
