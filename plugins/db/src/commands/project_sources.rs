#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_project_sources(
    state: tauri::State<'_, crate::ManagedState>,
    project_id: String,
) -> Result<Vec<typr_db_user::ProjectSource>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_project_sources(project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn set_project_source_status(
    state: tauri::State<'_, crate::ManagedState>,
    project_id: String,
    session_id: String,
    status: typr_db_user::ProjectSourceStatus,
) -> Result<(), String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.set_project_source_status(project_id, session_id, status)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn add_project_source(
    state: tauri::State<'_, crate::ManagedState>,
    project_id: String,
    session_id: String,
) -> Result<(), String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.add_session_to_project(project_id, session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn remove_project_source(
    state: tauri::State<'_, crate::ManagedState>,
    project_id: String,
    session_id: String,
) -> Result<(), String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.remove_session_from_project(project_id, session_id)
        .await
        .map_err(|e| e.to_string())
}
