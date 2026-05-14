mod commands;
mod deeplink;
mod ext;
mod store;

use ext::*;
use store::*;

use std::borrow::Cow;
use tauri_plugin_windows::{TyprWindow, WindowsPluginExt};

use tracing_subscriber::{
    fmt, prelude::__tracing_subscriber_SubscriberExt, util::SubscriberInitExt, EnvFilter,
};

#[tokio::main]
pub async fn main() {
    // CRITICAL: Load environment variables FIRST, before anything else
    #[cfg(debug_assertions)]
    {
        let _ = dotenvy::from_path("../../.env");
    }

    tauri::async_runtime::set(tokio::runtime::Handle::current());

    {
        let env_filter = EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| {
                // Check if user wants debug audio logs specifically
                if std::env::var("TYPR_AUDIO_DEBUG").is_ok() {
                    EnvFilter::new("debug")
                } else if cfg!(debug_assertions) {
                    // Default to info level to reduce noise, but enable audio pipeline logs
                    EnvFilter::new("info")
                } else {
                    EnvFilter::new("info")
                }
            })
            // Reduce whisper transcription logging verbosity
            .add_directive("whisper_local=warn".parse().unwrap())
            // Filter out noisy AI-related logs in production
            .add_directive("typr_llama=info".parse().unwrap())
            .add_directive("tauri_plugin_local_llm=info".parse().unwrap())
            // Filter out ONNX runtime verbose logs
            .add_directive("ort::logging=warn".parse().unwrap())
            // Filter out other ML/AI framework noise
            .add_directive("onnxruntime=warn".parse().unwrap())
            .add_directive("candle=warn".parse().unwrap())
            .add_directive("candle_core=warn".parse().unwrap())
            // Keep only audio pipeline and transcription related logs at debug level
            .add_directive("tauri_plugin_listener=debug".parse().unwrap())
            .add_directive("tauri_plugin_local_stt=debug".parse().unwrap());

        tracing_subscriber::Registry::default()
            .with(fmt::layer())
            .with(env_filter)
            .with(tauri_plugin_sentry::sentry::integrations::tracing::layer())
            .init();
    }

    let context = tauri::generate_context!();

    let client = tauri_plugin_sentry::sentry::init((
        std::env::var("SENTRY_DSN").unwrap_or_default(),
        tauri_plugin_sentry::sentry::ClientOptions {
            release: tauri_plugin_sentry::sentry::release_name!(),
            environment: Some(if cfg!(debug_assertions) {
                Cow::Borrowed("development")
            } else {
                Cow::Borrowed("production")
            }),
            send_default_pii: false,
            traces_sample_rate: 0.0,
            auto_session_tracking: false,
            ..Default::default()
        },
    ));

    let _guard = tauri_plugin_sentry::minidump::init(&client);

    let mut builder = tauri::Builder::default();

    // https://v2.tauri.app/plugin/deep-linking/#desktop
    // should always be the first plugin
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            app.window_show(TyprWindow::Main).unwrap();
        }));
    }

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder = builder
        .plugin(tauri_plugin_listener::init())
        .plugin(tauri_plugin_sse::init())
        .plugin(tauri_plugin_misc::init())
        .plugin(tauri_plugin_db::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_store2::init())
        .plugin(tauri_plugin_config::init())
        .plugin(tauri_plugin_template::init())
        .plugin(tauri_plugin_local_llm::init())
        .plugin(tauri_plugin_local_stt::init())
        .plugin(tauri_plugin_connector::init())
        .plugin(tauri_plugin_flags::init())
        .plugin(tauri_plugin_sentry::init_with_no_injection(&client))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_obsidian::init())
        .plugin(tauri_plugin_sfx::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_auth::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_task::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_machine_uid::init())
        .plugin(tauri_plugin_analytics::init())
        .plugin(tauri_plugin_tray::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_windows::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ));

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_plugin_apple_calendar::init())
    }

    #[cfg(not(debug_assertions))]
    {
        let plugin = tauri_plugin_prevent_default::init();
        builder = builder.plugin(plugin);
    }

    let specta_builder = make_specta_builder();

    let app = builder
        .invoke_handler(tauri::generate_handler![
            commands::sentry_dsn,
            commands::test_sentry_error,
            commands::is_onboarding_needed,
            commands::set_onboarding_needed,
            commands::get_onboarding_step,
            commands::set_onboarding_step,
            commands::get_onboarding_model_setup,
            commands::set_onboarding_model_setup,
            commands::ensure_welcome_note,
            commands::dismiss_welcome_note,
            commands::setup_db_for_cloud,
            commands::set_autostart,
            commands::extract_project_file_text,
            commands::extract_youtube_transcript,
            commands::setup_claude_mcp,
            commands::check_claude_mcp_status,
            commands::remove_claude_mcp,
        ])
        .on_window_event(tauri_plugin_windows::on_window_event)
        .setup(move |app| {
            let app = app.handle().clone();

            specta_builder.mount_events(&app);

            {
                use tauri_plugin_deep_link::DeepLinkExt;
                use tauri_plugin_windows::WindowsPluginExt;

                let app_clone = app.clone();

                // typr://typr.com + <path>
                app.deep_link().on_open_url(move |event| {
                    let url = if let Some(url) = event.urls().first() {
                        url.to_string()
                    } else {
                        return;
                    };

                    let dests = deeplink::parse(url);
                    for dest in dests {
                        if app_clone.window_show(dest.window.clone()).is_ok() {
                            let _ = app_clone.window_navigate(dest.window, &dest.url);
                        }
                    }
                });
            }

            {
                use tauri_plugin_tray::TrayPluginExt;
                app.create_tray_menu().unwrap();
                app.create_app_menu().unwrap();
            }

            {
                use tauri_plugin_autostart::ManagerExt;
                let autostart_manager = app.autolaunch();
                let _ = autostart_manager.disable();
            }

            // Setup database and other async operations after app is ready
            let app_clone = app.clone();
            tokio::spawn(async move {
                // Setup database BEFORE showing window (avoid race condition)
                if let Err(e) = app_clone.setup_db_for_local().await {
                    tracing::error!("failed_to_setup_db_for_local: {}", e);

                    // Still show the window so the user sees an error instead of
                    // the app appearing frozen with no window.
                    if let Err(e2) = TyprWindow::Main.show(&app_clone) {
                        tracing::error!("failed_to_show_main_window_after_db_error: {}", e2);
                    }

                    // Notify the frontend so it can display an error to the user
                    use tauri::Emitter;
                    let _ = app_clone.emit("boot-error", e.to_string());
                    return;
                }

                // Show main window only after database is attached and ready.
                if let Err(e) = TyprWindow::Main.show(&app_clone) {
                    tracing::error!("failed_to_show_main_window: {}", e);
                }

                // Migrate config from database to store (one-time migration)
                if let Err(e) = app_clone.migrate_config_to_store().await {
                    tracing::warn!("config_migration_skipped: {}", e);
                }

                {
                    use tauri_plugin_db::DatabasePluginExt;
                    let user_id = app_clone.db_user_id().await;

                    if let Ok(Some(ref user_id)) = user_id {
                        tauri_plugin_sentry::sentry::configure_scope(|scope| {
                            scope.set_user(Some(tauri_plugin_sentry::sentry::User {
                                id: Some(user_id.clone()),
                                ..Default::default()
                            }));
                        });
                    }
                }

                // Setup AI after database is ready
                if let Err(e) = app_clone.setup_local_ai().await {
                    tracing::error!("failed_to_setup_local_ai: {}", e);
                }
            });

            Ok(())
        })
        .build(context)
        .unwrap();

    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            TyprWindow::Main.show(app).unwrap();
        }
    });
}

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .commands(tauri_specta::collect_commands![
            commands::sentry_dsn::<tauri::Wry>,
            commands::test_sentry_error,
            commands::is_onboarding_needed::<tauri::Wry>,
            commands::set_onboarding_needed::<tauri::Wry>,
            commands::get_onboarding_step::<tauri::Wry>,
            commands::set_onboarding_step::<tauri::Wry>,
            commands::get_onboarding_model_setup::<tauri::Wry>,
            commands::set_onboarding_model_setup::<tauri::Wry>,
            commands::ensure_welcome_note::<tauri::Wry>,
            commands::dismiss_welcome_note::<tauri::Wry>,
            commands::setup_db_for_cloud::<tauri::Wry>,
            commands::set_autostart::<tauri::Wry>,
            commands::extract_project_file_text,
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn export_types() {
        make_specta_builder::<tauri::Wry>()
            .export(
                specta_typescript::Typescript::default()
                    .header("// @ts-nocheck\n\n")
                    .formatter(specta_typescript::formatter::prettier)
                    .bigint(specta_typescript::BigIntExportBehavior::Number),
                "../src/types/tauri.gen.ts",
            )
            .unwrap()
    }
}
