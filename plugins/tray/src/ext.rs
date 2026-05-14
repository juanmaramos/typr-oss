use tauri::{
    image::Image,
    menu::{Menu, MenuId, MenuItem, MenuItemKind, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Result,
};

use tauri_plugin_dialog::DialogExt;

const TRAY_ID: &str = "typr-tray";

pub enum TyprMenuItem {
    TrayOpen,
    TrayStart,
    TrayQuit,
    AppInfo,
    AppNew,
    AppCheckForUpdates,
}

impl From<TyprMenuItem> for MenuId {
    fn from(value: TyprMenuItem) -> Self {
        match value {
            TyprMenuItem::TrayOpen => "typr_tray_open",
            TyprMenuItem::TrayStart => "typr_tray_start",
            TyprMenuItem::TrayQuit => "typr_tray_quit",
            TyprMenuItem::AppInfo => "typr_app_info",
            TyprMenuItem::AppNew => "typr_app_new",
            TyprMenuItem::AppCheckForUpdates => "typr_app_check_for_updates",
        }
        .into()
    }
}

impl From<MenuId> for TyprMenuItem {
    fn from(id: MenuId) -> Self {
        let id = id.0.as_str();
        match id {
            "typr_tray_open" => TyprMenuItem::TrayOpen,
            "typr_tray_start" => TyprMenuItem::TrayStart,
            "typr_tray_quit" => TyprMenuItem::TrayQuit,
            "typr_app_info" => TyprMenuItem::AppInfo,
            "typr_app_new" => TyprMenuItem::AppNew,
            "typr_app_check_for_updates" => TyprMenuItem::AppCheckForUpdates,
            _ => unreachable!(),
        }
    }
}

pub trait TrayPluginExt<R: tauri::Runtime> {
    fn create_app_menu(&self) -> Result<()>;
    fn create_tray_menu(&self) -> Result<()>;
    fn set_start_disabled(&self, disabled: bool) -> Result<()>;
}

impl<T: tauri::Manager<tauri::Wry>> TrayPluginExt<tauri::Wry> for T {
    fn create_app_menu(&self) -> Result<()> {
        let app = self.app_handle();

        let info_item = app_info_menu(app)?;
        let new_item = app_new_menu(app)?;
        let check_updates_item = app_check_for_updates_menu(app)?;

        if cfg!(target_os = "macos") {
            if let Some(menu) = app.menu() {
                let items = menu.items()?;

                if items.len() > 0 {
                    if let MenuItemKind::Submenu(submenu) = &items[0] {
                        // Remove the default "About" and add our custom one
                        submenu.remove_at(0)?;
                        submenu.prepend(&info_item)?;

                        // Add "Check for Updates..." after "About Typr"
                        submenu.insert(&check_updates_item, 1)?;

                        return Ok(());
                    }
                }

                if items.len() > 1 {
                    if let MenuItemKind::Submenu(submenu) = &items[1] {
                        submenu.prepend(&new_item)?;
                        return Ok(());
                    }
                }
            }
        }

        Ok(())
    }

    fn create_tray_menu(&self) -> Result<()> {
        let app = self.app_handle();

        let menu = Menu::with_items(
            app,
            &[
                &tray_open_menu(app)?,
                &tray_start_menu(app, false)?,
                &PredefinedMenuItem::separator(app)?,
                &tray_quit_menu(app)?,
            ],
        )?;

        TrayIconBuilder::with_id(TRAY_ID)
            .icon(Image::from_bytes(include_bytes!(
                "../icons/menubar-icon32.png"
            ))?)
            .icon_as_template(true)
            .menu(&menu)
            .show_menu_on_left_click(true)
            .on_menu_event({
                move |app: &AppHandle, event| match TyprMenuItem::from(event.id.clone()) {
                    TyprMenuItem::TrayOpen => {
                        use tauri_plugin_windows::TyprWindow;
                        let _ = TyprWindow::Main.show(app);
                    }
                    TyprMenuItem::TrayStart => {
                        use tauri_plugin_windows::{TyprWindow, Navigate, WindowsPluginExt};
                        if let Ok(_) = app.window_show(TyprWindow::Main) {
                            let _ = app.window_emit_navigate(
                                TyprWindow::Main,
                                Navigate {
                                    path: "/app/new".to_string(),
                                    search: Some(
                                        serde_json::json!({ "record": true })
                                            .as_object()
                                            .cloned()
                                            .unwrap(),
                                    ),
                                },
                            );
                        }
                    }
                    TyprMenuItem::TrayQuit => {
                        app.exit(0);
                    }
                    TyprMenuItem::AppInfo => {
                        let app_version = app.package_info().version.to_string();

                        let message = format!(
                            "Typr\nVersion {}\n\nhttps://github.com/juanmaramos/typr-oss\n\n© 2026 RHAMS LLC",
                            app_version
                        );

                        app.dialog()
                            .message(&message)
                            .title("About Typr")
                            .blocking_show();
                    }
                    TyprMenuItem::AppNew => {
                        use tauri_plugin_windows::{TyprWindow, Navigate, WindowsPluginExt};
                        if let Ok(_) = app.window_show(TyprWindow::Main) {
                            let _ = app.window_emit_navigate(
                                TyprWindow::Main,
                                Navigate {
                                    path: "/app/new".to_string(),
                                    search: None,
                                },
                            );
                        }
                    }
                    TyprMenuItem::AppCheckForUpdates => {
                        // Emit event to trigger update check in the frontend
                        let _ = app.emit("check-for-updates", ());
                    }
                }
            })
            .build(app)?;

        Ok(())
    }

    fn set_start_disabled(&self, disabled: bool) -> Result<()> {
        let app = self.app_handle();

        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            let menu = Menu::with_items(
                app,
                &[
                    &tray_open_menu(app)?,
                    &tray_start_menu(app, disabled)?,
                    &PredefinedMenuItem::separator(app)?,
                    &tray_quit_menu(app)?,
                ],
            )?;

            tray.set_menu(Some(menu))?;
        }

        Ok(())
    }
}

fn app_info_menu<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<MenuItem<R>> {
    MenuItem::with_id(app, TyprMenuItem::AppInfo, "About Typr", true, None::<&str>)
}

fn app_new_menu<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<MenuItem<R>> {
    MenuItem::with_id(
        app,
        TyprMenuItem::AppNew,
        "New Note",
        true,
        Some("CmdOrCtrl+N"),
    )
}

fn app_check_for_updates_menu<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<MenuItem<R>> {
    MenuItem::with_id(
        app,
        TyprMenuItem::AppCheckForUpdates,
        "Check for Updates...",
        true,
        None::<&str>,
    )
}

fn tray_open_menu<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<MenuItem<R>> {
    MenuItem::with_id(app, TyprMenuItem::TrayOpen, "Open Typr", true, None::<&str>)
}

fn tray_start_menu<R: tauri::Runtime>(app: &AppHandle<R>, disabled: bool) -> Result<MenuItem<R>> {
    MenuItem::with_id(
        app,
        TyprMenuItem::TrayStart,
        "Start a new meeting",
        !disabled,
        None::<&str>,
    )
}

fn tray_quit_menu<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<MenuItem<R>> {
    MenuItem::with_id(app, TyprMenuItem::TrayQuit, "Quit", true, Some("cmd+q"))
}
