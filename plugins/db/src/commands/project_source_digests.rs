#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn upsert_project_source_digest(
    state: tauri::State<'_, crate::ManagedState>,
    digest: typr_db_user::ProjectSourceDigest,
) -> Result<typr_db_user::ProjectSourceDigest, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.upsert_project_source_digest(digest)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_project_source_digests(
    state: tauri::State<'_, crate::ManagedState>,
    project_id: String,
) -> Result<Vec<typr_db_user::ProjectSourceDigest>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_project_source_digests(project_id)
        .await
        .map_err(|e| e.to_string())
}
