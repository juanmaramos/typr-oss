use objc2_app_kit::{NSView, NSWindow, NSWindowButton, NSWindowStyleMask};
use objc2_foundation::{NSPoint, NSRect};
use tauri::{LogicalPosition, Manager, WebviewWindow, WindowEvent};

pub(super) const INSET: LogicalPosition<f64> = LogicalPosition::new(18.0, 29.0);

pub(super) fn install(window: &WebviewWindow) -> tauri::Result<()> {
    let event_window = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            event_window
                .state::<crate::ManagedState>()
                .lock()
                .unwrap()
                .titlebar_centers
                .remove(event_window.label());
        } else if resets_titlebar(event) {
            if let Err(error) = position(&event_window) {
                tracing::warn!("failed to position native window controls: {error}");
            }
        }
    });
    position(window)
}

pub(super) fn align(
    window: &WebviewWindow,
    center_y: f64,
    viewport_height: f64,
) -> Result<(), String> {
    if !valid_reference(center_y, viewport_height) {
        return Err("Invalid titlebar alignment reference".into());
    }
    window
        .state::<crate::ManagedState>()
        .lock()
        .unwrap()
        .titlebar_centers
        .insert(window.label().to_owned(), center_y);
    position(window).map_err(|error| error.to_string())
}

fn valid_reference(center_y: f64, viewport_height: f64) -> bool {
    center_y.is_finite()
        && viewport_height.is_finite()
        && center_y > 0.0
        && center_y <= viewport_height
}

fn point_from_top(bounds: NSRect, flipped: bool, distance: f64) -> NSPoint {
    NSPoint::new(
        bounds.origin.x,
        if flipped {
            bounds.origin.y + distance
        } else {
            bounds.origin.y + bounds.size.height - distance
        },
    )
}

fn titlebar_frame(mut frame: NSRect, parent: &NSView, height: f64) -> NSRect {
    frame.size.height = height;
    let bounds = parent.bounds();
    frame.origin.y = if parent.isFlipped() {
        bounds.origin.y
    } else {
        bounds.origin.y + bounds.size.height - height
    };
    frame
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
    let center = window
        .state::<crate::ManagedState>()
        .lock()
        .unwrap()
        .titlebar_centers
        .get(window.label())
        .copied();
    window.with_webview(move |native| {
        // Tauri keeps these borrowed native views alive on the main thread.
        unsafe {
            let window = &*native.ns_window().cast::<NSWindow>();
            let webview = &*native.inner().cast::<NSView>();
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

            let Some(parent) = container.superview() else {
                return;
            };
            let close_frame = NSView::frame(&close);
            let spacing = NSView::frame(&minimize).origin.x - close_frame.origin.x;
            // WKWebView page zoom converts CSS pixels to AppKit points. Retina
            // backing scale does not apply to either view's logical coordinates.
            let target = center.and_then(|center| {
                let zoom: f64 = objc2::msg_send![webview, pageZoom];
                let distance = center * zoom;
                if !valid_reference(distance, webview.bounds().size.height) {
                    return None;
                }
                Some(point_from_top(
                    webview.bounds(),
                    webview.isFlipped(),
                    distance,
                ))
            });
            let height = target
                .map(|point| {
                    let target = parent.convertPoint_fromView(point, Some(webview));
                    let top = point_from_top(parent.bounds(), parent.isFlipped(), 0.0);
                    (target.y - top.y).abs() + close_frame.size.height
                })
                .unwrap_or(close_frame.size.height + INSET.y);
            container.setFrame(titlebar_frame(container.frame(), &parent, height));

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
                    if let (Some(target), Some(parent)) = (target, button.superview()) {
                        let center = parent.convertPoint_fromView(target, Some(webview));
                        origin.y = center.y - NSView::frame(&button).size.height / 2.0;
                    }
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
    fn follows_the_measured_center_in_both_native_coordinate_directions() {
        let bounds = NSRect::new(
            NSPoint::new(0.0, 10.0),
            objc2_foundation::NSSize::new(800.0, 600.0),
        );
        for zoom in [0.8, 1.0, 1.5, 2.0] {
            let distance = 26.0 * zoom;
            assert_eq!(point_from_top(bounds, true, distance).y, 10.0 + distance);
            assert_eq!(point_from_top(bounds, false, distance).y, 610.0 - distance);
        }
    }

    #[test]
    fn rejects_invalid_or_outside_webview_references() {
        assert!(valid_reference(26.0, 600.0));
        assert!(valid_reference(600.0, 600.0));
        for (center, viewport) in [
            (0.0, 600.0),
            (-1.0, 600.0),
            (601.0, 600.0),
            (f64::NAN, 600.0),
            (26.0, f64::INFINITY),
            (26.0, 0.0),
        ] {
            assert!(!valid_reference(center, viewport));
        }
    }

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
