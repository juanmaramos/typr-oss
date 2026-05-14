#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn enqueue_project_knowledge_job(
    state: tauri::State<'_, crate::ManagedState>,
    job: typr_db_user::ProjectKnowledgeJob,
) -> Result<typr_db_user::ProjectKnowledgeJob, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.enqueue_project_knowledge_job(job)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_project_knowledge_jobs(
    state: tauri::State<'_, crate::ManagedState>,
    project_id: String,
) -> Result<Vec<typr_db_user::ProjectKnowledgeJob>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.list_project_knowledge_jobs(project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn claim_next_project_knowledge_job(
    state: tauri::State<'_, crate::ManagedState>,
) -> Result<Option<typr_db_user::ProjectKnowledgeJob>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.claim_next_project_knowledge_job()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn complete_project_knowledge_job(
    state: tauri::State<'_, crate::ManagedState>,
    id: String,
) -> Result<typr_db_user::ProjectKnowledgeJob, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.complete_project_knowledge_job(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn retry_project_knowledge_job(
    state: tauri::State<'_, crate::ManagedState>,
    id: String,
    error_message: String,
    run_after: String,
) -> Result<typr_db_user::ProjectKnowledgeJob, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.retry_project_knowledge_job(id, error_message, run_after)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn release_project_knowledge_job(
    state: tauri::State<'_, crate::ManagedState>,
    id: String,
    run_after: String,
) -> Result<typr_db_user::ProjectKnowledgeJob, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.release_project_knowledge_job(id, run_after)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn fail_project_knowledge_job(
    state: tauri::State<'_, crate::ManagedState>,
    id: String,
    error_message: String,
) -> Result<typr_db_user::ProjectKnowledgeJob, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.fail_project_knowledge_job(id, error_message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn reclaim_stale_project_knowledge_jobs(
    state: tauri::State<'_, crate::ManagedState>,
    stale_before: String,
    max_attempts: i64,
) -> Result<Vec<typr_db_user::ProjectKnowledgeJob>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.reclaim_stale_project_knowledge_jobs(stale_before, max_attempts)
        .await
        .map_err(|e| e.to_string())
}
