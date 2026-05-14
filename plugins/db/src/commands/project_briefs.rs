#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn upsert_project_brief(
    state: tauri::State<'_, crate::ManagedState>,
    brief: typr_db_user::ProjectBrief,
) -> Result<typr_db_user::ProjectBrief, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.upsert_project_brief(brief)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn get_latest_project_brief(
    state: tauri::State<'_, crate::ManagedState>,
    project_id: String,
) -> Result<Option<typr_db_user::ProjectBrief>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.get_latest_project_brief(project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn replace_project_brief_sources(
    state: tauri::State<'_, crate::ManagedState>,
    brief_id: String,
    sources: Vec<typr_db_user::ProjectBriefSource>,
) -> Result<Vec<typr_db_user::ProjectBriefSource>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.replace_project_brief_sources(brief_id, sources)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_project_brief_sources(
    state: tauri::State<'_, crate::ManagedState>,
    brief_id: String,
) -> Result<Vec<typr_db_user::ProjectBriefSource>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_project_brief_sources(brief_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn upsert_project_brief_refresh(
    state: tauri::State<'_, crate::ManagedState>,
    refresh: typr_db_user::ProjectBriefRefresh,
) -> Result<typr_db_user::ProjectBriefRefresh, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.upsert_project_brief_refresh(refresh)
        .await
        .map_err(|e| e.to_string())
}
