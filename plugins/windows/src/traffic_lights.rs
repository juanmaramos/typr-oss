use objc2_app_kit::{NSView, NSWindow, NSWindowButton, NSWindowStyleMask};
use tauri::{LogicalPosition, WebviewWindow, WindowEvent};

pub(super) const INSET: LogicalPosition<f64> = LogicalPosition::new(18.0, 29.0);

pub(super) fn install(window: &WebviewWindow) -> tauri::Result<()> {
    let event_window = window.clone();
    window.on_window_event(move |event| {
        if resets_titlebar(event) {
            if let Err(error) = position(&event_window) {
                tracing::warn!("failed to position native window controls: {error}");
            }
        }
    });
    position(window)
}

fn resets_titlebar(event: &WindowEvent) -> bool {
    matches!(
        event,
        WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } | WindowEvent::Focused(_)
    )
}

fn position(window: &WebviewWindow) -> tauri::Result<()> {
    // AppKit resets the titlebar during native layout. In our pinned Tauri/Wry,
    // the inset is otherwise restored only when a webview parent draws, which
    // need not happen when its WKWebView covers it. Follow the window lifecycle.
    let event_window = window.clone();
    window.run_on_main_thread(move || {
        let Ok(handle) = event_window.ns_window() else {
            return;
        };
        // The Rust window handle keeps this borrowed NSWindow alive on the main thread.
        unsafe {
            let window = &*handle.cast::<NSWindow>();
            if window.styleMask().contains(NSWindowStyleMask::FullScreen) {
                return;
            }
            let Some(close) = window.standardWindowButton(NSWindowButton::CloseButton) else {
                return;
            };
            let Some(minimize) = window.standardWindowButton(NSWindowButton::MiniaturizeButton)
            else {
                return;
            };
            let Some(container) = close.superview().and_then(|view| view.superview()) else {
                return;
            };

            // Match Tao 0.34.5/Wry 0.53.5: y extends the titlebar container;
            // it is not the button's top edge or center. Keep native button spacing.
            let close_frame = NSView::frame(&close);
            let spacing = NSView::frame(&minimize).origin.x - close_frame.origin.x;
            let mut frame = container.frame();
            frame.size.height = close_frame.size.height + INSET.y;
            frame.origin.y = window.frame().size.height - frame.size.height;
            container.setFrame(frame);

            for (index, button) in [
                Some(close),
                Some(minimize),
                window.standardWindowButton(NSWindowButton::ZoomButton),
            ]
            .into_iter()
            .enumerate()
            {
                if let Some(button) = button {
                    let mut origin = NSView::frame(&button).origin;
                    origin.x = INSET.x + index as f64 * spacing;
                    button.setFrameOrigin(origin);
                }
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::{PhysicalPosition, PhysicalSize};

    #[test]
    fn restores_controls_after_native_resize_and_focus_changes() {
        for event in [
            WindowEvent::Resized(PhysicalSize::new(800, 600)),
            WindowEvent::Resized(PhysicalSize::new(1600, 1200)),
            WindowEvent::Focused(true),
            WindowEvent::Focused(false),
        ] {
            assert!(resets_titlebar(&event), "{event:?}");
        }
        assert!(!resets_titlebar(&WindowEvent::Moved(
            PhysicalPosition::new(0, 0)
        )));
        assert!(!resets_titlebar(&WindowEvent::Destroyed));
    }
}
