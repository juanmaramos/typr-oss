pub use wezterm::ToastNotification as Notification;

#[cfg(target_os = "macos")]
mod macos;

pub fn show(notif: Notification) {
    if cfg!(debug_assertions) {
        // In debug mode: show console logs instead of crashing notifications
        eprintln!("");
        eprintln!("🔔 NOTIFICATION (dev mode - console only):");
        eprintln!("   📋 Title: {}", notif.title);
        eprintln!("   💬 Message: {}", notif.message);
        if let Some(url) = &notif.url {
            eprintln!("   🔗 URL: {}", url);
        }
        eprintln!("   💡 This will show as desktop notification in production build");
        eprintln!("");
    } else {
        // In production: show actual notifications
        wezterm::show(notif);
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub enum NotificationPermission {
    Granted,
    NotGrantedAndShouldRequest,
    NotGrantedAndShouldAskManual,
}

pub fn request_notification_permission() {
    #[cfg(target_os = "macos")]
    macos::request_notification_permission();
}

pub fn open_notification_settings() -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        return macos::open_notification_settings();
    }

    #[cfg(not(target_os = "macos"))]
    {
        return Ok(());
    }
}

pub fn check_notification_permission(
    completion: impl Fn(Result<NotificationPermission, String>) + 'static,
) {
    #[cfg(target_os = "macos")]
    macos::check_notification_permission(completion);
}

/// Register the meeting notification category with action buttons.
/// Must be called from the main thread at app startup.
#[cfg(target_os = "macos")]
pub fn register_meeting_category() {
    macos::register_meeting_category();
}

/// Install a callback for notification action taps.
/// The callback receives the action identifier (e.g. `"take_notes"`).
#[cfg(target_os = "macos")]
pub fn set_action_handler(handler: impl Fn(&str) + Send + Sync + 'static) {
    macos::set_action_handler(handler);
}

/// Show a "Meeting detected" notification with Take Notes / Dismiss actions.
#[cfg(target_os = "macos")]
pub fn show_meeting_detected(app_name: &str) {
    macos::show_meeting_detected(app_name);
}

/// The action identifier string for "Take Notes".
#[cfg(target_os = "macos")]
pub fn action_take_notes() -> &'static str {
    macos::action_take_notes()
}
