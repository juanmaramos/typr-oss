use crate::{types::*, ConfigPluginExt, StoreKey};
use std::str::FromStr;

#[tauri::command]
#[specta::specta]
pub fn get_general_config<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<ConfigGeneral, String> {
    let store = app.config_store();

    let autostart = store
        .get::<bool>(StoreKey::Autostart)
        .map_err(|e| e.to_string())?
        .unwrap_or(false);

    let display_language = store
        .get::<String>(StoreKey::DisplayLanguage)
        .map_err(|e| e.to_string())?
        .and_then(|s| {
            typr_language::ISO639::from_str(&s)
                .ok()
                .map(|iso| iso.into())
        })
        .unwrap_or(typr_language::ISO639::En.into());

    let spoken_languages = store
        .get::<Vec<String>>(StoreKey::SpokenLanguages)
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| vec!["en".to_string()])
        .into_iter()
        .filter_map(|s| {
            typr_language::ISO639::from_str(&s)
                .ok()
                .map(|iso| iso.into())
        })
        .collect();

    let jargons = store
        .get::<Vec<String>>(StoreKey::Jargons)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    let telemetry_consent = store
        .get::<bool>(StoreKey::TelemetryConsent)
        .map_err(|e| e.to_string())?
        .unwrap_or(true);

    let save_recordings = store
        .get::<bool>(StoreKey::SaveRecordings)
        .map_err(|e| e.to_string())?;

    let selected_template_id = store
        .get::<String>(StoreKey::SelectedTemplateId)
        .map_err(|e| e.to_string())?
        .filter(|s| !s.is_empty());

    let summary_language = store
        .get::<String>(StoreKey::SummaryLanguage)
        .map_err(|e| e.to_string())?
        .and_then(|s| {
            typr_language::ISO639::from_str(&s)
                .ok()
                .map(|iso| iso.into())
        })
        .unwrap_or(typr_language::ISO639::En.into());

    let show_consent_notification = store
        .get::<bool>(StoreKey::ShowConsentNotification)
        .map_err(|e| e.to_string())?
        .unwrap_or(true);

    let show_upcoming_in_sidebar = store
        .get::<bool>(StoreKey::ShowUpcomingInSidebar)
        .map_err(|e| e.to_string())?
        .unwrap_or_else(default_show_upcoming_in_sidebar);

    Ok(ConfigGeneral {
        autostart,
        display_language,
        spoken_languages,
        jargons,
        telemetry_consent,
        save_recordings,
        selected_template_id,
        summary_language,
        show_consent_notification,
        show_upcoming_in_sidebar,
    })
}

#[tauri::command]
#[specta::specta]
pub fn set_general_config<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    config: ConfigGeneral,
) -> Result<(), String> {
    let store = app.config_store();

    store
        .set(StoreKey::Autostart, config.autostart)
        .map_err(|e| e.to_string())?;

    store
        .set(
            StoreKey::DisplayLanguage,
            config.display_language.to_string(),
        )
        .map_err(|e| e.to_string())?;

    store
        .set(
            StoreKey::SpokenLanguages,
            config
                .spoken_languages
                .iter()
                .map(|l| l.to_string())
                .collect::<Vec<_>>(),
        )
        .map_err(|e| e.to_string())?;

    store
        .set(StoreKey::Jargons, config.jargons)
        .map_err(|e| e.to_string())?;

    store
        .set(StoreKey::TelemetryConsent, config.telemetry_consent)
        .map_err(|e| e.to_string())?;

    if let Some(save_recordings) = config.save_recordings {
        store
            .set(StoreKey::SaveRecordings, save_recordings)
            .map_err(|e| e.to_string())?;
    }

    store
        .set(
            StoreKey::SelectedTemplateId,
            config.selected_template_id.unwrap_or_default(),
        )
        .map_err(|e| e.to_string())?;

    store
        .set(
            StoreKey::SummaryLanguage,
            config.summary_language.to_string(),
        )
        .map_err(|e| e.to_string())?;

    store
        .set(
            StoreKey::ShowConsentNotification,
            config.show_consent_notification,
        )
        .map_err(|e| e.to_string())?;

    store
        .set(
            StoreKey::ShowUpcomingInSidebar,
            config.show_upcoming_in_sidebar,
        )
        .map_err(|e| e.to_string())?;

    // Save immediately to disk
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_notification_config<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<ConfigNotification, String> {
    let store = app.config_store();

    let before = store
        .get::<bool>(StoreKey::NotificationBefore)
        .map_err(|e| e.to_string())?
        .unwrap_or(true);

    let auto = store
        .get::<bool>(StoreKey::NotificationDuring)
        .map_err(|e| e.to_string())?
        .unwrap_or(true);

    let ignored_platforms = store
        .get::<Vec<String>>(StoreKey::NotificationAfter)
        .map_err(|e| e.to_string())?;

    Ok(ConfigNotification {
        before,
        auto,
        ignored_platforms,
    })
}

#[tauri::command]
#[specta::specta]
pub fn set_notification_config<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    config: ConfigNotification,
) -> Result<(), String> {
    let store = app.config_store();

    store
        .set(StoreKey::NotificationBefore, config.before)
        .map_err(|e| e.to_string())?;

    store
        .set(StoreKey::NotificationDuring, config.auto)
        .map_err(|e| e.to_string())?;

    if let Some(ignored_platforms) = config.ignored_platforms {
        store
            .set(StoreKey::NotificationAfter, ignored_platforms)
            .map_err(|e| e.to_string())?;
    }

    // Save immediately to disk
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_ai_config<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<ConfigAI, String> {
    let store = app.config_store();

    let api_base = store
        .get::<String>(StoreKey::AiApiBase)
        .map_err(|e| e.to_string())?;

    let api_key = store
        .get::<String>(StoreKey::AiApiKey)
        .map_err(|e| e.to_string())?;

    let ai_specificity = store
        .get::<u8>(StoreKey::AiSpecificity)
        .map_err(|e| e.to_string())?;

    let redemption_time_ms = store
        .get::<u32>(StoreKey::AiRedemptionTimeMs)
        .map_err(|e| e.to_string())?;

    Ok(ConfigAI {
        api_base,
        api_key,
        ai_specificity,
        redemption_time_ms,
    })
}

#[tauri::command]
#[specta::specta]
pub fn set_ai_config<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    config: ConfigAI,
) -> Result<(), String> {
    let store = app.config_store();

    if let Some(api_base) = config.api_base {
        store
            .set(StoreKey::AiApiBase, api_base)
            .map_err(|e| e.to_string())?;
    }

    if let Some(api_key) = config.api_key {
        store
            .set(StoreKey::AiApiKey, api_key)
            .map_err(|e| e.to_string())?;
    }

    if let Some(ai_specificity) = config.ai_specificity {
        store
            .set(StoreKey::AiSpecificity, ai_specificity)
            .map_err(|e| e.to_string())?;
    }

    if let Some(redemption_time_ms) = config.redemption_time_ms {
        store
            .set(StoreKey::AiRedemptionTimeMs, redemption_time_ms)
            .map_err(|e| e.to_string())?;
    }

    // Save immediately to disk
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}
