#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn list_templates(
    state: tauri::State<'_, crate::ManagedState>,
) -> Result<Vec<typr_db_user::Template>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    let user_id = guard
        .user_id
        .as_ref()
        .ok_or(crate::Error::NoneUser)
        .map_err(|e| e.to_string())?;

    db.list_templates(user_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn upsert_template(
    state: tauri::State<'_, crate::ManagedState>,
    template: typr_db_user::Template,
) -> Result<typr_db_user::Template, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    db.upsert_template(template)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn delete_template(
    state: tauri::State<'_, crate::ManagedState>,
    id: String,
) -> Result<(), String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    // Clean up orphaned favorites before deleting template
    db.cleanup_template_favorites(id.clone())
        .await
        .map_err(|e| e.to_string())?;

    db.delete_template(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn toggle_template_favorite(
    state: tauri::State<'_, crate::ManagedState>,
    template_id: String,
    is_favorite: bool,
) -> Result<(), String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    let user_id = guard
        .user_id
        .as_ref()
        .ok_or(crate::Error::NoneUser)
        .map_err(|e| e.to_string())?;

    if is_favorite {
        db.add_template_favorite(user_id.clone(), template_id)
            .await
            .map_err(|e| e.to_string())
    } else {
        db.remove_template_favorite(user_id.clone(), template_id)
            .await
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn get_favorite_templates(
    state: tauri::State<'_, crate::ManagedState>,
) -> Result<Vec<String>, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    let user_id = guard
        .user_id
        .as_ref()
        .ok_or(crate::Error::NoneUser)
        .map_err(|e| e.to_string())?;

    db.list_user_favorite_templates(user_id.clone())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
#[tracing::instrument(skip(state))]
pub async fn is_template_favorited(
    state: tauri::State<'_, crate::ManagedState>,
    template_id: String,
) -> Result<bool, String> {
    let guard = state.lock().await;

    let db = guard
        .db
        .as_ref()
        .ok_or(crate::Error::NoneDatabase)
        .map_err(|e| e.to_string())?;

    let user_id = guard
        .user_id
        .as_ref()
        .ok_or(crate::Error::NoneUser)
        .map_err(|e| e.to_string())?;

    db.is_template_favorited(user_id.clone(), template_id)
        .await
        .map_err(|e| e.to_string())
}
