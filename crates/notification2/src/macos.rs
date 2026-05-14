use std::ptr::NonNull;
use std::sync::{Arc, LazyLock, Mutex};

use block2::{Block, RcBlock};
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, MainThreadOnly};
use objc2_foundation::{MainThreadMarker, NSArray, NSObject, NSObjectProtocol, NSSet, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent, UNNotification,
    UNNotificationAction, UNNotificationActionOptions, UNNotificationCategory,
    UNNotificationCategoryOptions, UNNotificationPresentationOptions, UNNotificationRequest,
    UNNotificationResponse, UNNotificationSettings, UNNotificationSound,
    UNTimeIntervalNotificationTrigger, UNUserNotificationCenter, UNUserNotificationCenterDelegate,
};

use crate::NotificationPermission;

/// Returns true if the process is running inside a proper .app bundle.
/// `UNUserNotificationCenter` crashes with `bundleProxyForCurrentProcess is nil`
/// when invoked from a bare `cargo run` binary that has no bundle.
fn has_app_bundle() -> bool {
    objc2_foundation::NSBundle::mainBundle()
        .bundleIdentifier()
        .is_some()
}

const MEETING_CATEGORY_ID: &str = "meeting_detected";
const ACTION_TAKE_NOTES: &str = "take_notes";
const ACTION_DISMISS: &str = "dismiss";

static ACTION_HANDLER: LazyLock<Mutex<Option<Arc<dyn Fn(&str) + Send + Sync + 'static>>>> =
    LazyLock::new(|| Mutex::new(None));

// -- Delegate ----------------------------------------------------------------

#[derive(Default)]
struct DelegateIvars;

define_class!(
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[name = "Notification2Delegate"]
    #[ivars = DelegateIvars]
    struct Notification2Delegate;

    unsafe impl NSObjectProtocol for Notification2Delegate {}

    unsafe impl UNUserNotificationCenterDelegate for Notification2Delegate {
        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        fn did_receive_response(
            &self,
            _center: &UNUserNotificationCenter,
            response: &UNNotificationResponse,
            completion_handler: &Block<dyn Fn()>,
        ) {
            let action_id = response.actionIdentifier().to_string();

            if let Ok(guard) = ACTION_HANDLER.lock() {
                if let Some(handler) = guard.as_ref() {
                    handler(&action_id);
                }
            }

            completion_handler.call(());
        }

        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present_notification(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion_handler: &Block<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            let options = UNNotificationPresentationOptions::Banner
                | UNNotificationPresentationOptions::Sound;
            completion_handler.call((options,));
        }
    }
);

impl Notification2Delegate {
    fn new(mtm: MainThreadMarker) -> objc2::rc::Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(DelegateIvars);
        unsafe { msg_send![super(this), init] }
    }
}

// -- Public API --------------------------------------------------------------

/// Set up the delegate and register the meeting notification category.
/// Must be called from the main thread at app startup.
pub fn register_meeting_category() {
    if !has_app_bundle() {
        tracing::warn!("skipping register_meeting_category: no .app bundle (dev mode)");
        return;
    }

    let Some(mtm) = MainThreadMarker::new() else {
        tracing::error!("register_meeting_category must be called from the main thread");
        return;
    };

    let center = UNUserNotificationCenter::currentNotificationCenter();

    // Create and install delegate. Leak it intentionally — it must live for the process lifetime.
    let delegate = Notification2Delegate::new(mtm);
    center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    std::mem::forget(delegate);

    // Build actions.
    let take_notes = UNNotificationAction::actionWithIdentifier_title_options(
        &NSString::from_str(ACTION_TAKE_NOTES),
        &NSString::from_str("Take Notes"),
        UNNotificationActionOptions::Foreground,
    );

    let dismiss = UNNotificationAction::actionWithIdentifier_title_options(
        &NSString::from_str(ACTION_DISMISS),
        &NSString::from_str("Dismiss"),
        UNNotificationActionOptions(0),
    );

    let actions = NSArray::from_retained_slice(&[take_notes, dismiss]);
    let intents: objc2::rc::Retained<NSArray<NSString>> = NSArray::new();

    let category = UNNotificationCategory::categoryWithIdentifier_actions_intentIdentifiers_options(
        &NSString::from_str(MEETING_CATEGORY_ID),
        &actions,
        &intents,
        UNNotificationCategoryOptions(0),
    );

    let categories = NSSet::from_retained_slice(&[category]);
    center.setNotificationCategories(&categories);

    // Request authorization.
    let auth_options = UNAuthorizationOptions::Alert
        | UNAuthorizationOptions::Sound
        | UNAuthorizationOptions::Badge;
    let completion = RcBlock::new(
        move |granted: objc2::runtime::Bool, error: *mut objc2_foundation::NSError| {
            if !error.is_null() {
                let desc = unsafe { (*error).localizedDescription() };
                tracing::error!("notification authorization error: {}", desc);
            } else {
                tracing::info!("notification authorization granted: {}", granted.as_bool());
            }
        },
    );
    center.requestAuthorizationWithOptions_completionHandler(auth_options, &completion);

    tracing::info!("registered meeting notification category with Take Notes action");
}

/// Install a callback that fires when the user taps a notification action.
/// The callback receives the action identifier (e.g. `"take_notes"`).
pub fn set_action_handler(handler: impl Fn(&str) + Send + Sync + 'static) {
    if let Ok(mut guard) = ACTION_HANDLER.lock() {
        *guard = Some(Arc::new(handler));
    }
}

/// Show a "Meeting detected" notification with the Take Notes action button.
pub fn show_meeting_detected(app_name: &str) {
    if !has_app_bundle() {
        tracing::info!(
            "meeting detected (dev mode, no native notification): {}",
            app_name
        );
        return;
    }

    let center = UNUserNotificationCenter::currentNotificationCenter();

    let content = UNMutableNotificationContent::new();
    let sound = UNNotificationSound::defaultSound();

    content.setTitle(&NSString::from_str("Meeting detected"));
    content.setBody(&NSString::from_str(app_name));
    content.setSound(Some(&sound));
    content.setCategoryIdentifier(&NSString::from_str(MEETING_CATEGORY_ID));

    let trigger = UNTimeIntervalNotificationTrigger::triggerWithTimeInterval_repeats(0.1, false);

    let request_id = format!(
        "meeting-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
        &NSString::from_str(&request_id),
        &content,
        Some(&trigger),
    );

    let completion = RcBlock::new(|error: *mut objc2_foundation::NSError| {
        if !error.is_null() {
            let desc = unsafe { (*error).localizedDescription() };
            tracing::error!("failed to deliver meeting notification: {}", desc);
        }
    });

    center.addNotificationRequest_withCompletionHandler(&request, Some(&completion));
}

/// Returns the action identifier for "Take Notes".
pub fn action_take_notes() -> &'static str {
    ACTION_TAKE_NOTES
}

// -- Existing permission functions (unchanged) --------------------------------

pub fn request_notification_permission() {
    if cfg!(debug_assertions) {
        return;
    }
    wezterm::macos_initialize();
}

pub fn open_notification_settings() -> std::io::Result<()> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.Notifications-Settings.extension")
        .spawn()?
        .wait()?;
    Ok(())
}

pub fn check_notification_permission(
    completion: impl Fn(Result<NotificationPermission, String>) + 'static,
) {
    if cfg!(debug_assertions) {
        completion(Ok(NotificationPermission::Granted));
        return;
    }

    let completion_block = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        let settings = unsafe { settings.as_ref() };
        let auth_status = settings.authorizationStatus();

        let result = match auth_status {
            UNAuthorizationStatus::Authorized => NotificationPermission::Granted,
            UNAuthorizationStatus::NotDetermined => {
                NotificationPermission::NotGrantedAndShouldRequest
            }
            _ => NotificationPermission::NotGrantedAndShouldAskManual,
        };
        completion(Ok(result))
    });

    UNUserNotificationCenter::currentNotificationCenter()
        .getNotificationSettingsWithCompletionHandler(&completion_block);
}
