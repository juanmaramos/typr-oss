#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn upsert_project_file(
    state: tauri::State<'_, crate::ManagedState>,
    file: typr_db_user::ProjectFile,
) -> Result<typr_db_user::ProjectFile, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.upsert_project_file(file)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_project_files(
    state: tauri::State<'_, crate::ManagedState>,
    project_id: String,
) -> Result<Vec<typr_db_user::ProjectFile>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_project_files(project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn delete_project_file(
    state: tauri::State<'_, crate::ManagedState>,
    file_id: String,
) -> Result<(), String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.delete_project_file(file_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn upsert_project_file_extraction(
    state: tauri::State<'_, crate::ManagedState>,
    extraction: typr_db_user::ProjectFileExtraction,
) -> Result<typr_db_user::ProjectFileExtraction, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.upsert_project_file_extraction(extraction)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_project_file_extractions(
    state: tauri::State<'_, crate::ManagedState>,
    project_id: String,
) -> Result<Vec<typr_db_user::ProjectFileExtraction>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_project_file_extractions(project_id)
        .await
        .map_err(|e| e.to_string())
}
