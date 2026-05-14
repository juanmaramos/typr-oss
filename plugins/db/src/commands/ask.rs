#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn create_ask_thread(
    state: tauri::State<'_, crate::ManagedState>,
    thread: typr_db_user::AskThread,
) -> Result<typr_db_user::AskThread, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.create_ask_thread(thread)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn get_ask_thread(
    state: tauri::State<'_, crate::ManagedState>,
    thread_id: String,
) -> Result<Option<typr_db_user::AskThread>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.get_ask_thread(thread_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_ask_threads(
    state: tauri::State<'_, crate::ManagedState>,
    user_id: String,
    scope_type: Option<typr_db_user::AskScopeType>,
    scope_id: Option<String>,
) -> Result<Vec<typr_db_user::AskThread>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_ask_threads(user_id, scope_type, scope_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn archive_ask_thread(
    state: tauri::State<'_, crate::ManagedState>,
    thread_id: String,
) -> Result<(), String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.archive_ask_thread(thread_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn upsert_ask_message(
    state: tauri::State<'_, crate::ManagedState>,
    message: typr_db_user::AskMessage,
) -> Result<typr_db_user::AskMessage, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.upsert_ask_message(message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_ask_messages(
    state: tauri::State<'_, crate::ManagedState>,
    thread_id: String,
) -> Result<Vec<typr_db_user::AskMessage>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_ask_messages(thread_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn upsert_ask_context_snapshot(
    state: tauri::State<'_, crate::ManagedState>,
    snapshot: typr_db_user::AskContextSnapshot,
) -> Result<typr_db_user::AskContextSnapshot, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.upsert_ask_context_snapshot(snapshot)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_ask_context_snapshots(
    state: tauri::State<'_, crate::ManagedState>,
    thread_id: String,
) -> Result<Vec<typr_db_user::AskContextSnapshot>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_ask_context_snapshots(thread_id)
        .await
        .map_err(|e| e.to_string())
}
