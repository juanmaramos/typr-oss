use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use tauri_specta::Event;
use uuid::Uuid;

use crate::events;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, PartialEq, Eq, Hash)]
#[serde(tag = "type", content = "value")]
pub enum TyprWindow {
    #[serde(rename = "main")]
    Main,
    #[serde(rename = "note")]
    Note(String),
    #[serde(rename = "human")]
    Human(String),
    #[serde(rename = "organization")]
    Organization(String),
    #[serde(rename = "finder")]
    Finder,
    #[serde(rename = "video")]
    Video(String),
    #[serde(rename = "control")]
    Control,
    #[serde(rename = "transcriptionStatus")]
    TranscriptionStatus,
}

impl std::fmt::Display for TyprWindow {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Main => write!(f, "main"),
            Self::Note(id) => write!(f, "note-{}", id),
            Self::Human(id) => write!(f, "human-{}", id),
            Self::Organization(id) => write!(f, "organization-{}", id),
            Self::Finder => write!(f, "finder"),
            Self::Video(id) => write!(f, "video-{}", id),
            Self::Control => write!(f, "control"),
            Self::TranscriptionStatus => write!(f, "transcription-status"),
        }
    }
}

impl std::str::FromStr for TyprWindow {
    type Err = strum::ParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "main" => return Ok(Self::Main),
            "finder" => return Ok(Self::Finder),
            "control" => return Ok(Self::Control),
            "transcription-status" => return Ok(Self::TranscriptionStatus),
            _ => {}
        }

        if let Some((prefix, id)) = s.split_once('-') {
            match prefix {
                "note" => return Ok(Self::Note(id.to_string())),
                "human" => return Ok(Self::Human(id.to_string())),
                "organization" => return Ok(Self::Organization(id.to_string())),
                "video" => return Ok(Self::Video(id.to_string())),
                _ => {}
            }
        }

        Err(strum::ParseError::VariantNotFound)
    }
}

#[derive(
    Debug,
    serde::Serialize,
    serde::Deserialize,
    specta::Type,
    strum::EnumString,
    PartialEq,
    Eq,
    Hash,
)]
pub enum KnownPosition {
    #[serde(rename = "left-half")]
    LeftHalf,
    #[serde(rename = "right-half")]
    RightHalf,
    #[serde(rename = "center")]
    Center,
}

const TRANSCRIPTION_STATUS_FALLBACK_WIDTH: f64 = 180.0;
const TRANSCRIPTION_STATUS_FALLBACK_HEIGHT: f64 = 30.0;
const TRANSCRIPTION_STATUS_NOTCH_EDGE_PAD: f64 = 16.0;

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Copy)]
struct TranscriptionStatusWindowFrame {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[cfg(target_os = "macos")]
impl TranscriptionStatusWindowFrame {
    fn size(self) -> LogicalSize<f64> {
        LogicalSize::new(self.width, self.height)
    }
}

impl TyprWindow {
    pub fn label(&self) -> String {
        self.to_string()
    }

    pub fn emit_navigate(
        &self,
        app: &AppHandle<tauri::Wry>,
        event: events::Navigate,
    ) -> Result<(), crate::Error> {
        if let Some(_) = self.get(app) {
            events::Navigate::emit_to(&event, app, self.label())?;
        }
        Ok(())
    }

    pub fn navigate(
        &self,
        app: &AppHandle<tauri::Wry>,
        path: impl AsRef<str>,
    ) -> Result<(), crate::Error> {
        if let Some(window) = self.get(app) {
            let mut url = window.url().unwrap();

            let path_str = path.as_ref();
            if let Some(query_index) = path_str.find('?') {
                let (path_part, query_part) = path_str.split_at(query_index);
                url.set_path(path_part);
                url.set_query(Some(&query_part[1..]));
            } else {
                url.set_path(path_str);
                url.set_query(None);
            }

            window.navigate(url)?;
        }

        Ok(())
    }

    pub fn title(&self) -> String {
        match self {
            Self::Main => "Typr".into(),
            Self::Note(_) => "Note".into(),
            Self::Human(_) => "Human".into(),
            Self::Organization(_) => "Organization".into(),
            Self::Finder => "Finder".into(),
            Self::Video(_) => "Video".into(),
            Self::Control => "Control".into(),
            Self::TranscriptionStatus => "Transcription Status".into(),
        }
    }

    pub fn get(&self, app: &AppHandle<tauri::Wry>) -> Option<WebviewWindow> {
        let label = self.label();
        app.get_webview_window(&label)
    }

    pub fn position(
        &self,
        app: &AppHandle<tauri::Wry>,
        pos: KnownPosition,
    ) -> Result<(), crate::Error> {
        if let Some(window) = self.get(app) {
            let monitor = window
                .current_monitor()?
                .ok_or(crate::Error::MonitorNotFound)?;

            let monitor_size = monitor.size();
            let window_size = window.outer_size()?;

            let scale_factor = window.scale_factor()?;
            let logical_monitor_width = monitor_size.width as f64 / scale_factor;
            let logical_monitor_height = monitor_size.height as f64 / scale_factor;
            let logical_window_width = window_size.width as f64 / scale_factor;
            let logical_window_height = window_size.height as f64 / scale_factor;

            let split_point = logical_monitor_width * 0.5;

            let y = (logical_monitor_height - logical_window_height) / 2.0;
            let x = match pos {
                KnownPosition::LeftHalf => split_point - logical_window_width,
                KnownPosition::RightHalf => split_point,
                KnownPosition::Center => split_point - logical_window_width / 2.0,
            };

            let x = x.max(0.0).min(logical_monitor_width - logical_window_width);
            let y = y
                .max(0.0)
                .min(logical_monitor_height - logical_window_height);

            window.set_position(LogicalPosition::new(x, y))?;
        }

        Ok(())
    }

    fn close(&self, app: &AppHandle<tauri::Wry>) -> Result<(), crate::Error> {
        match self {
            TyprWindow::Control => {
                crate::abort_overlay_join_handle();

                #[cfg(target_os = "macos")]
                {
                    use tauri_nspanel::ManagerExt;
                    if let Ok(panel) = app.get_webview_panel(&TyprWindow::Control.label()) {
                        app.run_on_main_thread({
                            let panel = panel.clone();
                            move || {
                                panel.set_released_when_closed(true);
                                panel.close();
                            }
                        })
                        .map_err(|e| {
                            tracing::warn!("Failed to run panel close on main thread: {}", e)
                        })
                        .ok();
                    }
                }
                #[cfg(not(target_os = "macos"))]
                {
                    if let Some(window) = self.get(app) {
                        let _ = window.close();
                    }
                }
            }
            _ => {
                if let Some(window) = self.get(app) {
                    let _ = window.close();
                }
            }
        }

        Ok(())
    }

    fn hide(&self, app: &AppHandle<tauri::Wry>) -> Result<(), crate::Error> {
        if let Some(window) = self.get(app) {
            if matches!(self, Self::TranscriptionStatus) {
                tracing::info!("[TRANSCRIPTION_STATUS_WINDOW] hide requested");
            }
            window.hide()?;
        }

        Ok(())
    }

    fn destroy(&self, app: &AppHandle<tauri::Wry>) -> Result<(), crate::Error> {
        if let Some(window) = self.get(app) {
            window.destroy()?;
        }

        Ok(())
    }

    pub fn is_visible(&self, app: &AppHandle<tauri::Wry>) -> Result<bool, crate::Error> {
        self.get(app).map_or(Ok(false), |w| {
            w.is_visible().map_err(crate::Error::TauriError)
        })
    }

    pub fn is_on_screen(&self, app: &AppHandle<tauri::Wry>) -> Result<bool, crate::Error> {
        let Some(window) = self.get(app) else {
            return Ok(false);
        };

        let visible = window.is_visible().map_err(crate::Error::TauriError)?;
        let minimized = window.is_minimized().map_err(crate::Error::TauriError)?;

        Ok(visible && !minimized && !Self::app_is_hidden(app))
    }

    pub fn show(&self, app: &AppHandle<tauri::Wry>) -> Result<WebviewWindow, crate::Error> {
        if self == &Self::Main {
            use tauri_plugin_analytics::{typr_analytics::AnalyticsPayload, AnalyticsPluginExt};
            use tauri_plugin_auth::{AuthPluginExt, StoreKey};

            let user_id = app
                .get_from_store(StoreKey::UserId)?
                .unwrap_or("UNKNOWN".into());

            let e = AnalyticsPayload::for_user(user_id)
                .event("show_main_window")
                .build();

            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = app_clone.event(e).await {
                    tracing::error!("failed_to_send_analytics: {:?}", e);
                }
            });
        }

        if let Some(window) = self.get(app) {
            if matches!(self, Self::TranscriptionStatus) {
                tracing::info!("[TRANSCRIPTION_STATUS_WINDOW] show existing window");
            }
            #[cfg(target_os = "macos")]
            if matches!(self, Self::TranscriptionStatus) {
                Self::configure_transcription_status_window(app, &window, false);
            }
            if matches!(self, Self::TranscriptionStatus) {
                Self::reset_transcription_status_window_frame(app, &window)?;
            }
            if self.should_focus_on_show() {
                window.set_focus()?;
            }
            window.show()?;

            #[cfg(target_os = "macos")]
            if matches!(self, Self::TranscriptionStatus) {
                Self::configure_transcription_status_window(app, &window, true);
                Self::reset_transcription_status_window_frame(app, &window)?;
            }

            return Ok(window);
        }

        let monitor = app
            .primary_monitor()?
            .ok_or_else(|| crate::Error::MonitorNotFound)?;

        let window = match self {
            Self::Main => {
                // Content-optimal sizing based on monitor dimensions
                let monitor_width = (monitor.size().width as f64) / monitor.scale_factor();
                let monitor_height = (monitor.size().height as f64) / monitor.scale_factor();

                // Industry standard: content-first approach
                let optimal_content_width = 1000.0_f64;
                let sidebar_total_width = 560.0_f64; // left (280) + right (280)
                let ideal_window_width = optimal_content_width + sidebar_total_width;

                // Calculate optimal dimensions
                let window_width = (monitor_width * 0.85)
                    .min(ideal_window_width.max(1200.0_f64))
                    .max(800.0_f64);

                let window_height = (monitor_height * 0.80).min(1000.0_f64).max(600.0_f64);

                let builder = self
                    .window_builder(app, "/app/new")
                    .maximizable(true)
                    .minimizable(true)
                    .min_inner_size(800.0, 600.0);
                let window = builder.build()?;
                window.set_size(LogicalSize::new(window_width, window_height))?;
                window
            }
            Self::Note(id) => self
                .window_builder(app, &format!("/app/note/{}", id))
                .inner_size(480.0, 500.0)
                .min_inner_size(480.0, 360.0)
                .center()
                .build()?,
            Self::Human(id) => self
                .window_builder(app, &format!("/app/human/{}", id))
                .inner_size(480.0, 500.0)
                .min_inner_size(480.0, 360.0)
                .center()
                .build()?,
            Self::Organization(id) => self
                .window_builder(app, &format!("/app/organization/{}", id))
                .inner_size(480.0, 500.0)
                .min_inner_size(480.0, 360.0)
                .center()
                .build()?,
            Self::Finder => self
                .window_builder(app, "/app/finder")
                .inner_size(900.0, 650.0)
                .min_inner_size(800.0, 600.0)
                .build()?,
            Self::Video(id) => self
                .window_builder(app, &format!("/video?id={}", id))
                .maximizable(false)
                .minimizable(false)
                .inner_size(640.0, 360.0)
                .min_inner_size(640.0, 360.0)
                .build()?,
            Self::Control => {
                let window_width = (monitor.size().width as f64) / monitor.scale_factor();
                let window_height = (monitor.size().height as f64) / monitor.scale_factor();

                let mut builder = WebviewWindow::builder(
                    app,
                    self.label(),
                    WebviewUrl::App("/app/control".into()),
                )
                .title("")
                .disable_drag_drop_handler()
                .maximized(false)
                .resizable(false)
                .fullscreen(false)
                .shadow(false)
                .always_on_top(true)
                .visible_on_all_workspaces(true)
                .accept_first_mouse(true)
                .content_protected(true)
                .inner_size(window_width, window_height)
                .skip_taskbar(true)
                .position(0.0, 0.0)
                .transparent(true);

                #[cfg(target_os = "macos")]
                {
                    builder = builder
                        .title_bar_style(tauri::TitleBarStyle::Overlay)
                        .hidden_title(true);
                }

                #[cfg(not(target_os = "macos"))]
                {
                    builder = builder.decorations(false);
                }

                let window = builder.build()?;

                #[cfg(target_os = "macos")]
                {
                    #[allow(deprecated, unexpected_cfgs)]
                    app.run_on_main_thread({
                        let window = window.clone();
                        move || {
                            use objc2::runtime::AnyObject;
                            use objc2::msg_send;

                            if let Ok(ns_window) = window.ns_window() {
                                unsafe {
                                    let ns_window = ns_window as *mut AnyObject;
                                    let ns_window = &*ns_window;

                                    const NS_WINDOW_CLOSE_BUTTON: u64 = 0;
                                    const NS_WINDOW_MINIATURIZE_BUTTON: u64 = 1;
                                    const NS_WINDOW_ZOOM_BUTTON: u64 = 2;

                                    let close_button: *mut AnyObject = msg_send![ns_window, standardWindowButton: NS_WINDOW_CLOSE_BUTTON];
                                    let miniaturize_button: *mut AnyObject = msg_send![ns_window, standardWindowButton: NS_WINDOW_MINIATURIZE_BUTTON];
                                    let zoom_button: *mut AnyObject = msg_send![ns_window, standardWindowButton: NS_WINDOW_ZOOM_BUTTON];

                                    if !close_button.is_null() {
                                        let _: () = msg_send![close_button, setHidden: true];
                                    }
                                    if !miniaturize_button.is_null() {
                                        let _: () = msg_send![miniaturize_button, setHidden: true];
                                    }
                                    if !zoom_button.is_null() {
                                        let _: () = msg_send![zoom_button, setHidden: true];
                                    }

                                    // Make title bar transparent instead of changing style mask
                                    let _: () = msg_send![ns_window, setTitlebarAppearsTransparent: true];
                                    let _: () = msg_send![ns_window, setMovableByWindowBackground: true];
                                }
                            }
                        }
                    }).map_err(|e| tracing::warn!("Failed to run window setup on main thread: {}", e)).ok();
                }

                crate::spawn_overlay_listener(app.clone(), window.clone());

                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        crate::abort_overlay_join_handle();
                    }
                });

                window
            }
            Self::TranscriptionStatus => {
                let (position, size) = Self::transcription_status_window_frame(app)?;

                tracing::info!(
                    "[TRANSCRIPTION_STATUS_WINDOW] build x={} y={} width={} height={}",
                    position.x,
                    position.y,
                    size.width,
                    size.height
                );

                let mut builder = WebviewWindow::builder(
                    app,
                    self.label(),
                    WebviewUrl::App("/transcription-status".into()),
                )
                .title("")
                .disable_drag_drop_handler()
                .maximized(false)
                .resizable(false)
                .fullscreen(false)
                .shadow(false)
                .always_on_top(true)
                .visible_on_all_workspaces(true)
                .accept_first_mouse(true)
                .content_protected(false)
                .visible(false)
                .inner_size(size.width, size.height)
                .skip_taskbar(true)
                .position(position.x, position.y)
                .transparent(true);

                #[cfg(target_os = "macos")]
                {
                    builder = builder.decorations(false).hidden_title(true);
                }

                #[cfg(not(target_os = "macos"))]
                {
                    builder = builder.decorations(false);
                }

                let window = builder.build()?;

                window
            }
        };

        if self.should_focus_on_show() {
            window.set_focus()?;
        }
        #[cfg(target_os = "macos")]
        if matches!(self, Self::TranscriptionStatus) {
            Self::configure_transcription_status_window(app, &window, false);
        }
        if matches!(self, Self::TranscriptionStatus) {
            Self::reset_transcription_status_window_frame(app, &window)?;
        }
        window.show()?;

        #[cfg(target_os = "macos")]
        if matches!(self, Self::TranscriptionStatus) {
            Self::configure_transcription_status_window(app, &window, true);
            Self::reset_transcription_status_window_frame(app, &window)?;
        }

        if self == &Self::Main {
            if let Err(e) = app.handle_main_window_visibility(true) {
                tracing::error!("failed_to_handle_main_window_visibility: {:?}", e);
            }
        }

        Ok(window)
    }

    #[cfg(target_os = "macos")]
    fn configure_transcription_status_window(
        app: &AppHandle<tauri::Wry>,
        window: &WebviewWindow,
        order_front: bool,
    ) {
        let window = window.clone();

        if let Err(err) = app.run_on_main_thread(move || {
            use objc2_app_kit::NSWindow;

            if let Ok(ns_window) = window.ns_window() {
                unsafe {
                    let ns_window = ns_window as *mut NSWindow;
                    let ns_window = &*ns_window;
                    Self::configure_transcription_status_ns_window(ns_window, order_front);
                }

                tracing::info!(
                    "[TRANSCRIPTION_STATUS_WINDOW] configured macos notch-level window order_front={}",
                    order_front
                );
            }
        }) {
            tracing::warn!(
                "[TRANSCRIPTION_STATUS_WINDOW] failed to configure macos window: {}",
                err
            );
        }
    }

    #[cfg(target_os = "macos")]
    fn configure_transcription_status_ns_window(
        ns_window: &objc2_app_kit::NSWindow,
        order_front: bool,
    ) {
        use objc2_app_kit::NSWindowCollectionBehavior;

        // OpenTeleprompt uses level 27 for notch overlays: above the main menu
        // level without using the extreme screen-saver level.
        const NOTCH_WINDOW_LEVEL: isize = 27;
        const NS_WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES: usize = 1 << 0;
        const NS_WINDOW_COLLECTION_BEHAVIOR_STATIONARY: usize = 1 << 4;
        const NS_WINDOW_COLLECTION_BEHAVIOR_IGNORES_CYCLE: usize = 1 << 6;
        const NS_WINDOW_COLLECTION_BEHAVIOR_FULL_SCREEN_AUXILIARY: usize = 1 << 8;
        const COLLECTION_BEHAVIOR: usize = NS_WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES
            | NS_WINDOW_COLLECTION_BEHAVIOR_STATIONARY
            | NS_WINDOW_COLLECTION_BEHAVIOR_IGNORES_CYCLE
            | NS_WINDOW_COLLECTION_BEHAVIOR_FULL_SCREEN_AUXILIARY;

        ns_window.setLevel(NOTCH_WINDOW_LEVEL);
        ns_window.setCollectionBehavior(NSWindowCollectionBehavior(COLLECTION_BEHAVIOR));
        ns_window.setCanHide(false);
        ns_window.setHasShadow(false);
        if order_front {
            ns_window.orderFrontRegardless();
        }
    }

    fn transcription_status_window_frame(
        app: &AppHandle<tauri::Wry>,
    ) -> Result<(LogicalPosition<f64>, LogicalSize<f64>), crate::Error> {
        let monitor = app
            .primary_monitor()?
            .ok_or_else(|| crate::Error::MonitorNotFound)?;

        let scale_factor = monitor.scale_factor();
        let monitor_width = (monitor.size().width as f64) / scale_factor;
        let monitor_x = (monitor.position().x as f64) / scale_factor;
        let monitor_y = (monitor.position().y as f64) / scale_factor;
        let size = Self::transcription_status_window_size(app);

        let x = monitor_x + ((monitor_width - size.width) / 2.0).max(0.0);
        let y = monitor_y;

        Ok((LogicalPosition::new(x, y), size))
    }

    fn transcription_status_window_size(app: &AppHandle<tauri::Wry>) -> LogicalSize<f64> {
        #[cfg(target_os = "macos")]
        if let Some(frame) = Self::macos_status_window_frame(app) {
            return frame.size();
        }

        LogicalSize::new(
            TRANSCRIPTION_STATUS_FALLBACK_WIDTH,
            TRANSCRIPTION_STATUS_FALLBACK_HEIGHT,
        )
    }

    #[cfg(target_os = "macos")]
    fn macos_status_window_frame(
        app: &AppHandle<tauri::Wry>,
    ) -> Option<TranscriptionStatusWindowFrame> {
        if let Some(frame) = Self::macos_status_window_frame_on_main_thread() {
            return Some(frame);
        }

        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(Self::macos_status_window_frame_on_main_thread());
        })
        .ok()?;

        rx.recv_timeout(std::time::Duration::from_millis(500))
            .ok()
            .flatten()
    }

    #[cfg(target_os = "macos")]
    fn macos_status_window_frame_on_main_thread() -> Option<TranscriptionStatusWindowFrame> {
        use objc2::MainThreadMarker;
        use objc2_app_kit::NSScreen;

        let mtm = MainThreadMarker::new()?;
        let screen = NSScreen::mainScreen(mtm)?;
        let frame = screen.frame();
        let visible_frame = screen.visibleFrame();
        let safe_area = screen.safeAreaInsets();
        let left_area = screen.auxiliaryTopLeftArea();
        let right_area = screen.auxiliaryTopRightArea();

        let menu_bar_height = (frame.origin.y + frame.size.height)
            - (visible_frame.origin.y + visible_frame.size.height);
        let notch_height = (if safe_area.top > 0.0 {
            safe_area.top
        } else {
            menu_bar_height
        })
        .max(0.0);

        let has_notch = left_area.size.width > 0.0 && right_area.size.width > 0.0;
        let notch_width = frame.size.width - left_area.size.width - right_area.size.width;
        let has_valid_notch =
            has_notch && notch_width > 0.0 && notch_width <= frame.size.width * 0.5;

        let (width, height) = if has_valid_notch && notch_height > 0.0 {
            let minimal_hud_width = notch_height * 2.0;
            (
                notch_width + minimal_hud_width + TRANSCRIPTION_STATUS_NOTCH_EDGE_PAD,
                notch_height,
            )
        } else {
            (
                TRANSCRIPTION_STATUS_FALLBACK_WIDTH,
                TRANSCRIPTION_STATUS_FALLBACK_HEIGHT,
            )
        };

        Some(TranscriptionStatusWindowFrame {
            x: frame.origin.x + ((frame.size.width - width) / 2.0).max(0.0),
            y: frame.origin.y + frame.size.height - height,
            width,
            height,
        })
    }

    fn reset_transcription_status_window_frame(
        app: &AppHandle<tauri::Wry>,
        window: &WebviewWindow,
    ) -> Result<(), crate::Error> {
        #[cfg(target_os = "macos")]
        if Self::reset_macos_transcription_status_window_frame(app, window) {
            return Ok(());
        }

        let (position, size) = Self::transcription_status_window_frame(app)?;
        window.set_size(size)?;
        window.set_position(position)?;

        tracing::info!(
            "[TRANSCRIPTION_STATUS_WINDOW] frame x={} y={} width={} height={}",
            position.x,
            position.y,
            size.width,
            size.height
        );

        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn reset_macos_transcription_status_window_frame(
        app: &AppHandle<tauri::Wry>,
        window: &WebviewWindow,
    ) -> bool {
        if let Some(frame) =
            Self::apply_macos_transcription_status_window_frame_on_main_thread(window)
        {
            tracing::info!(
                "[TRANSCRIPTION_STATUS_WINDOW] macos frame x={} y={} width={} height={}",
                frame.x,
                frame.y,
                frame.width,
                frame.height
            );
            return true;
        }

        let window = window.clone();
        let (tx, rx) = std::sync::mpsc::channel();

        if app
            .run_on_main_thread(move || {
                let applied_frame =
                    Self::apply_macos_transcription_status_window_frame_on_main_thread(&window);

                if let Some(frame) = applied_frame {
                    tracing::info!(
                        "[TRANSCRIPTION_STATUS_WINDOW] macos frame x={} y={} width={} height={}",
                        frame.x,
                        frame.y,
                        frame.width,
                        frame.height
                    );
                }

                let _ = tx.send(applied_frame.is_some());
            })
            .is_err()
        {
            return false;
        }

        rx.recv_timeout(std::time::Duration::from_millis(500))
            .unwrap_or(false)
    }

    #[cfg(target_os = "macos")]
    fn apply_macos_transcription_status_window_frame_on_main_thread(
        window: &WebviewWindow,
    ) -> Option<TranscriptionStatusWindowFrame> {
        use objc2_app_kit::NSWindow;
        use objc2_foundation::{NSPoint, NSRect, NSSize};

        let frame = Self::macos_status_window_frame_on_main_thread()?;
        let ns_window = window.ns_window().ok()?;

        unsafe {
            let ns_window = ns_window as *mut NSWindow;
            let ns_window = &*ns_window;
            Self::configure_transcription_status_ns_window(ns_window, false);
            let ns_frame = NSRect::new(
                NSPoint::new(frame.x, frame.y),
                NSSize::new(frame.width, frame.height),
            );
            ns_window.setFrame_display(ns_frame, true);
        }

        Some(frame)
    }

    fn should_focus_on_show(&self) -> bool {
        !matches!(self, Self::Control | Self::TranscriptionStatus)
    }

    #[cfg(target_os = "macos")]
    fn app_is_hidden(app: &AppHandle<tauri::Wry>) -> bool {
        use objc2::MainThreadMarker;
        use objc2_app_kit::NSApplication;

        if let Some(mtm) = MainThreadMarker::new() {
            return NSApplication::sharedApplication(mtm).isHidden();
        }

        let (tx, rx) = std::sync::mpsc::channel();
        if app
            .run_on_main_thread(move || {
                let hidden = MainThreadMarker::new()
                    .map(|mtm| NSApplication::sharedApplication(mtm).isHidden())
                    .unwrap_or(false);
                let _ = tx.send(hidden);
            })
            .is_err()
        {
            return false;
        }

        rx.recv_timeout(std::time::Duration::from_millis(100))
            .unwrap_or(false)
    }

    #[cfg(not(target_os = "macos"))]
    fn app_is_hidden(_app: &AppHandle<tauri::Wry>) -> bool {
        false
    }

    fn window_builder<'a>(
        &'a self,
        app: &'a AppHandle<tauri::Wry>,
        url: impl Into<std::path::PathBuf>,
    ) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle<tauri::Wry>> {
        let mut builder = WebviewWindow::builder(app, self.label(), WebviewUrl::App(url.into()))
            .title(self.title())
            .disable_drag_drop_handler();

        #[cfg(target_os = "macos")]
        {
            builder = builder
                .decorations(true)
                .hidden_title(true)
                .theme(Some(tauri::Theme::Light))
                .traffic_light_position(tauri::LogicalPosition::new(18.0, 29.0))
                .title_bar_style(tauri::TitleBarStyle::Overlay);
        }

        #[cfg(target_os = "windows")]
        {
            // Enable decorations on Windows to show close/minimize/maximize buttons
            builder = builder.decorations(true);
        }

        builder
    }
}

pub trait WindowsPluginExt<R: tauri::Runtime> {
    fn handle_main_window_visibility(&self, visible: bool) -> Result<(), crate::Error>;

    fn window_show(&self, window: TyprWindow) -> Result<WebviewWindow, crate::Error>;
    fn window_close(&self, window: TyprWindow) -> Result<(), crate::Error>;
    fn window_hide(&self, window: TyprWindow) -> Result<(), crate::Error>;
    fn window_destroy(&self, window: TyprWindow) -> Result<(), crate::Error>;
    fn window_position(&self, window: TyprWindow, pos: KnownPosition) -> Result<(), crate::Error>;
    fn window_is_visible(&self, window: TyprWindow) -> Result<bool, crate::Error>;
    fn window_is_on_screen(&self, window: TyprWindow) -> Result<bool, crate::Error>;

    fn window_get_floating(&self, window: TyprWindow) -> Result<bool, crate::Error>;
    fn window_set_floating(&self, window: TyprWindow, v: bool) -> Result<(), crate::Error>;

    fn window_emit_navigate(
        &self,
        window: TyprWindow,
        event: events::Navigate,
    ) -> Result<(), crate::Error>;

    fn window_navigate(
        &self,
        window: TyprWindow,
        path: impl AsRef<str>,
    ) -> Result<(), crate::Error>;
}

impl WindowsPluginExt<tauri::Wry> for AppHandle<tauri::Wry> {
    fn handle_main_window_visibility(&self, visible: bool) -> Result<(), crate::Error> {
        let state = self.state::<crate::ManagedState>();
        let mut guard = state.lock().unwrap();

        let window_state = guard.windows.entry(TyprWindow::Main).or_default();

        if window_state.visible != visible {
            let previous_visible = window_state.visible;
            window_state.visible = visible;

            let event_name = if visible {
                "show_main_window"
            } else {
                "hide_main_window"
            };

            let session_id = if !previous_visible && visible {
                let new_session_id = Uuid::new_v4().to_string();
                window_state.id = new_session_id.clone();
                new_session_id
            } else {
                window_state.id.clone()
            };

            let user_id = {
                use tauri_plugin_auth::{AuthPluginExt, StoreKey};

                self.get_from_store(StoreKey::UserId)?
                    .unwrap_or("UNKNOWN".into())
            };

            {
                use tauri_plugin_analytics::{
                    typr_analytics::AnalyticsPayload, AnalyticsPluginExt,
                };

                let e = AnalyticsPayload::for_user(user_id)
                    .event(event_name)
                    .with("session_id", session_id)
                    .build();

                let app_clone = self.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = app_clone.event(e).await {
                        tracing::error!("failed_to_send_analytics: {:?}", e);
                    }
                });
            }
        }

        Ok(())
    }

    fn window_show(&self, window: TyprWindow) -> Result<WebviewWindow, crate::Error> {
        window.show(self)
    }

    fn window_close(&self, window: TyprWindow) -> Result<(), crate::Error> {
        window.close(self)
    }

    fn window_hide(&self, window: TyprWindow) -> Result<(), crate::Error> {
        window.hide(self)
    }

    fn window_destroy(&self, window: TyprWindow) -> Result<(), crate::Error> {
        window.destroy(self)
    }

    fn window_position(&self, window: TyprWindow, pos: KnownPosition) -> Result<(), crate::Error> {
        window.position(self, pos)
    }

    fn window_is_visible(&self, window: TyprWindow) -> Result<bool, crate::Error> {
        window.is_visible(self)
    }

    fn window_is_on_screen(&self, window: TyprWindow) -> Result<bool, crate::Error> {
        window.is_on_screen(self)
    }

    fn window_get_floating(&self, window: TyprWindow) -> Result<bool, crate::Error> {
        let app = self.app_handle();
        let state = app.state::<crate::ManagedState>();

        let v = {
            let guard = state.lock().unwrap();
            guard
                .windows
                .get(&window)
                .map(|w| w.floating)
                .unwrap_or(false)
        };

        Ok(v)
    }

    fn window_set_floating(&self, window: TyprWindow, v: bool) -> Result<(), crate::Error> {
        let app = self.app_handle();
        let state = app.state::<crate::ManagedState>();

        if let Some(w) = window.get(self) {
            w.set_always_on_top(v)?;

            {
                let mut guard = state.lock().unwrap();
                guard.windows.entry(window).or_default().floating = v;
            }
        }

        Ok(())
    }

    fn window_emit_navigate(
        &self,
        window: TyprWindow,
        event: events::Navigate,
    ) -> Result<(), crate::Error> {
        window.emit_navigate(self, event)
    }

    fn window_navigate(
        &self,
        window: TyprWindow,
        path: impl AsRef<str>,
    ) -> Result<(), crate::Error> {
        window.navigate(self, path)
    }
}
