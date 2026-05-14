use tauri_plugin_store2::ScopedStoreKey;

#[derive(serde::Deserialize, specta::Type, PartialEq, Eq, Hash, strum::Display)]
pub enum StoreKey {
    Autostart,
    DisplayLanguage,
    SpokenLanguages,
    Jargons,
    TelemetryConsent,
    SaveRecordings,
    SelectedTemplateId,
    SummaryLanguage,
    ShowConsentNotification,
    ShowUpcomingInSidebar,
    // Notification settings
    NotificationBefore,
    NotificationDuring,
    NotificationAfter,
    // AI settings
    AiSpecificity,
    AiRedemptionTimeMs,
    AiApiBase,
    AiApiKey,
    // Internal lifecycle safety thresholds (not user-facing)
    SessionInactivityStopAfterMs,
    SessionInactivityWarningBeforeMs,
    SessionMaxDurationMs,
    SessionMaxDurationWarningBeforeMs,
}

impl ScopedStoreKey for StoreKey {}
