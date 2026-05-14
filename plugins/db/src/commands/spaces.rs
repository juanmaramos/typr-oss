#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_spaces(
    state: tauri::State<'_, crate::ManagedState>,
) -> Result<Vec<typr_db_user::Space>, String> {
    let guard = state.lock().await;
    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_spaces().await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn get_space(
    state: tauri::State<'_, crate::ManagedState>,
    space_id: String,
) -> Result<Option<typr_db_user::Space>, String> {
    let guard = state.lock().await;
    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.get_space(space_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn create_space(
    state: tauri::State<'_, crate::ManagedState>,
    space: typr_db_user::Space,
) -> Result<typr_db_user::Space, String> {
    let guard = state.lock().await;
    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.create_space(space).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn update_space(
    state: tauri::State<'_, crate::ManagedState>,
    space: typr_db_user::Space,
) -> Result<typr_db_user::Space, String> {
    let guard = state.lock().await;
    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.update_space(space).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn delete_space(
    state: tauri::State<'_, crate::ManagedState>,
    space_id: String,
) -> Result<(), String> {
    let guard = state.lock().await;
    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.delete_space(space_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn assign_session_to_space(
    state: tauri::State<'_, crate::ManagedState>,
    session_id: String,
    space_id: String,
) -> Result<(), String> {
    let guard = state.lock().await;
    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.assign_session_to_space(session_id, space_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn clear_session_space(
    state: tauri::State<'_, crate::ManagedState>,
    session_id: String,
) -> Result<(), String> {
    let guard = state.lock().await;
    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.clear_session_space(session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_sessions_by_space(
    state: tauri::State<'_, crate::ManagedState>,
    space_id: String,
    limit: Option<u8>,
    search: Option<String>,
) -> Result<Vec<typr_db_user::Session>, String> {
    let guard = state.lock().await;
    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_sessions_by_space(space_id, limit, search)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_included_sessions_by_space(
    state: tauri::State<'_, crate::ManagedState>,
    space_id: String,
    limit: Option<u8>,
    search: Option<String>,
) -> Result<Vec<typr_db_user::Session>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_included_sessions_by_space(space_id, limit, search)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_projects_by_session(
    state: tauri::State<'_, crate::ManagedState>,
    session_id: String,
) -> Result<Vec<typr_db_user::Space>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_projects_by_session(session_id)
        .await
        .map_err(|e| e.to_string())
}
