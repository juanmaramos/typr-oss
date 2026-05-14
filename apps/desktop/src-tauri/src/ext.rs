use std::future::Future;

use tauri::Manager;
use tauri_plugin_db::DatabasePluginExt;
use tauri_plugin_store2::{ScopedStore, StorePluginExt};

pub trait AppExt<R: tauri::Runtime> {
    fn sentry_dsn(&self) -> String;
    fn desktop_store(&self) -> Result<ScopedStore<R, crate::StoreKey>, String>;
    fn setup_local_ai(&self) -> impl Future<Output = Result<(), String>>;
    fn setup_db_for_local(&self) -> impl Future<Output = Result<(), String>>;
    fn setup_db_for_local_impl(&self) -> impl Future<Output = Result<(), String>>;
    fn recover_database_schema(&self) -> impl Future<Output = Result<(), String>>;
    fn setup_db_for_cloud(&self) -> impl Future<Output = Result<(), String>>;
    fn migrate_config_to_store(&self) -> impl Future<Output = Result<(), String>>;
}

impl<R: tauri::Runtime, T: tauri::Manager<R> + tauri::Emitter<R>> AppExt<R> for T {
    fn sentry_dsn(&self) -> String {
        std::env::var("SENTRY_DSN").unwrap_or_default()
    }

    #[tracing::instrument(skip_all)]
    fn desktop_store(&self) -> Result<ScopedStore<R, crate::StoreKey>, String> {
        self.scoped_store("desktop").map_err(|e| e.to_string())
    }

    #[tracing::instrument(skip_all)]
    async fn setup_local_ai(&self) -> Result<(), String> {
        {
            use tauri_plugin_local_stt::{LocalSttPluginExt, SupportedModel};

            let current_model = self
                .get_current_model()
                .unwrap_or(SupportedModel::QuantizedSmall);

            if let Ok(true) = self.is_model_downloaded(&current_model).await {
                if let Err(e) = self.start_server().await {
                    tracing::error!("start_local_stt_server: {}", e);
                }
            }
        }

        {
            use tauri_plugin_local_llm::{LocalLlmPluginExt, SupportedModel};

            let current_model = self
                .get_current_model()
                .unwrap_or(SupportedModel::Gemma4E4b);

            if let Ok(true) = self.is_model_downloaded(&current_model).await {
                if let Err(e) = self.start_server().await {
                    tracing::error!("start_local_llm_server: {}", e);
                }
            }
        }

        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn setup_db_for_local(&self) -> Result<(), String> {
        // Attempt normal setup first
        match self.setup_db_for_local_impl().await {
            Ok(_) => Ok(()),
            Err(e)
                if e.contains("no column named")
                    || e.contains("duplicate column name")
                    || e.contains("has no column named") =>
            {
                // Schema mismatch detected - attempt recovery
                tracing::warn!(
                    "Database schema mismatch detected, attempting recovery: {}",
                    e
                );
                self.recover_database_schema().await
            }
            Err(e) => Err(e),
        }
    }

    #[tracing::instrument(skip_all)]
    async fn setup_db_for_local_impl(&self) -> Result<(), String> {
        let (db, _db_just_created) = {
            // Use file database in both debug and production for consistency
            // This matches how commercial apps ensure dev/prod parity
            let local_db_path = self.db_local_path().unwrap();
            let is_existing = std::path::Path::new(&local_db_path).exists();

            (
                typr_db_core::DatabaseBuilder::default()
                    .local(local_db_path.clone())
                    .build()
                    .await
                    .map_err(|e| {
                        tracing::error!("Failed to build database at {}: {}", local_db_path, e);
                        format!("Database initialization failed: {}", e)
                    })?,
                !is_existing,
            )
        };

        let (user_id, _user_id_just_created) = {
            use tauri_plugin_auth::{AuthPluginExt, StoreKey as AuthStoreKey};

            let stored = self.get_from_store(AuthStoreKey::UserId).unwrap_or(None);
            if let Some(id) = stored {
                (id, false)
            } else {
                let store = self.desktop_store();
                store
                    .unwrap()
                    .set(crate::StoreKey::OnboardingNeeded, true)
                    .unwrap();

                let id = uuid::Uuid::new_v4().to_string();
                self.set_in_store(AuthStoreKey::UserId, &id).unwrap();
                (id, true)
            }
        };

        if let Err(e) = self.db_attach(db).await {
            return Err(format!("Failed to attach database: {}", e));
        }

        if let Ok(true) = self.db_ensure_user(&user_id).await {
            use tauri_plugin_analytics::{typr_analytics, AnalyticsPluginExt};

            let e = typr_analytics::AnalyticsPayload::for_user(&user_id)
                .event("user_created")
                .build();

            if let Err(e) = self.event(e).await {
                tracing::error!("failed_to_send_analytics: {}", e);
            }
        }

        {
            let state = self.state::<tauri_plugin_db::ManagedState>();
            let s = state.lock().await;
            let user_db = s.db.as_ref().unwrap();

            if let Err(e) = typr_db_user::init::ensure_user_and_config(user_db, &user_id).await {
                tracing::error!("Failed to initialize user defaults: {}", e);
                return Err(format!("Database user initialization failed: {}", e));
            }

            let desktop_store = self.desktop_store()?;
            let welcome_note_created = desktop_store
                .get(crate::StoreKey::WelcomeNoteCreated)
                .map_err(|e| e.to_string())?
                .unwrap_or(false);
            let welcome_note_dismissed = desktop_store
                .get(crate::StoreKey::WelcomeNoteDismissed)
                .map_err(|e| e.to_string())?
                .unwrap_or(false);
            let onboarding_needed = desktop_store
                .get(crate::StoreKey::OnboardingNeeded)
                .map_err(|e| e.to_string())?
                .unwrap_or(false);

            if !welcome_note_created && !welcome_note_dismissed && !onboarding_needed {
                if let Err(e) =
                    typr_db_user::init::create_welcome_note_once(user_db, &user_id).await
                {
                    tracing::error!("Failed to create welcome note: {}", e);
                    return Err(format!("Welcome note initialization failed: {}", e));
                }

                desktop_store
                    .set(crate::StoreKey::WelcomeNoteCreated, true)
                    .map_err(|e| e.to_string())?;
                desktop_store.save().map_err(|e| e.to_string())?;
            }

            // Safe to cleanup sessions now that user exists
            if let Err(e) = user_db.cleanup_sessions().await {
                tracing::warn!(
                    "Failed to cleanup sessions after user initialization: {}",
                    e
                );
            }

            #[cfg(debug_assertions)]
            {
                // Add seed data for development - silently skip if foreign key constraints fail
                if let Err(_e) = typr_db_user::init::seed(user_db, &user_id).await {
                    // Silently skip seeding errors to keep logs clean
                    // Common in development when switching branches or schema changes
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            use tauri_plugin_apple_calendar::AppleCalendarPluginExt;
            self.start_worker(&user_id).await?;
        }

        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn recover_database_schema(&self) -> Result<(), String> {
        tracing::info!("Attempting non-destructive database schema recovery");

        let local_db_path = self.db_local_path().map_err(|e| e.to_string())?;

        if !std::path::Path::new(&local_db_path).exists() {
            return self.setup_db_for_local_impl().await;
        }

        // Try additive schema patches first to preserve user data.
        let db = typr_db_core::DatabaseBuilder::default()
            .local(local_db_path.clone())
            .build()
            .await
            .map_err(|e| format!("Failed to open local database for recovery: {}", e))?;

        let conn = db
            .conn()
            .map_err(|e| format!("Failed to connect to local database for recovery: {}", e))?;

        let patches = [
            "CREATE TABLE IF NOT EXISTS spaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')))",
            "CREATE INDEX IF NOT EXISTS idx_spaces_updated_at ON spaces(updated_at DESC)",
            "ALTER TABLE sessions ADD COLUMN words TEXT NOT NULL DEFAULT '[]'",
            "ALTER TABLE sessions ADD COLUMN record_start TEXT",
            "ALTER TABLE sessions ADD COLUMN record_end TEXT",
            "ALTER TABLE sessions ADD COLUMN pre_meeting_memo_html TEXT",
            "ALTER TABLE sessions ADD COLUMN source_type TEXT DEFAULT 'manual'",
            "ALTER TABLE sessions ADD COLUMN source_metadata TEXT",
            "ALTER TABLE sessions ADD COLUMN space_id TEXT DEFAULT NULL REFERENCES spaces(id)",
            "CREATE INDEX IF NOT EXISTS idx_sessions_space_id ON sessions(space_id)",
        ];

        for patch in patches {
            match conn.execute(patch, ()).await {
                Ok(_) => tracing::info!("Applied schema patch: {}", patch),
                Err(e) => {
                    let message = e.to_string();
                    if message.contains("duplicate column name") {
                        tracing::info!("Schema patch already applied: {}", patch);
                    } else {
                        tracing::warn!("Schema patch failed (continuing): {} ({})", patch, message);
                    }
                }
            }
        }

        // Retry normal setup after patches.
        self.setup_db_for_local_impl().await
    }

    #[tracing::instrument(skip_all)]
    async fn setup_db_for_cloud(&self) -> Result<(), String> {
        Err("Cloud database sync is not included in the OSS build".to_string())
    }

    #[tracing::instrument(skip_all)]
    async fn migrate_config_to_store(&self) -> Result<(), String> {
        use tauri_plugin_config::ConfigPluginExt;

        // Check if migration already done
        let config_store = self.config_store();
        if config_store
            .get::<String>(tauri_plugin_config::StoreKey::SummaryLanguage)
            .unwrap_or(None)
            .is_some()
        {
            tracing::info!("Config already migrated to store, skipping");
            return Ok(());
        }

        tracing::info!("Starting config migration from database to store");

        // Get config from database
        let user_id = self.db_user_id().await.map_err(|e| e.to_string())?;

        if let Some(user_id) = user_id {
            let db_config = self
                .db_get_config(&user_id)
                .await
                .map_err(|e| e.to_string())?;

            if let Some(config) = db_config {
                tracing::info!("Migrating config for user: {}", user_id);

                // Migrate general config
                let general = tauri_plugin_config::ConfigGeneral {
                    autostart: config.general.autostart,
                    display_language: config.general.display_language,
                    spoken_languages: config.general.spoken_languages,
                    jargons: config.general.jargons,
                    telemetry_consent: config.general.telemetry_consent,
                    save_recordings: config.general.save_recordings,
                    selected_template_id: config.general.selected_template_id,
                    summary_language: config.general.summary_language,
                    show_consent_notification: config.general.show_consent_notification,
                    show_upcoming_in_sidebar: tauri_plugin_config::ConfigGeneral::default()
                        .show_upcoming_in_sidebar,
                };

                // Migrate notification config
                let notification = tauri_plugin_config::ConfigNotification {
                    before: config.notification.before,
                    auto: config.notification.auto,
                    ignored_platforms: config.notification.ignored_platforms,
                };

                // Migrate AI config
                let ai = tauri_plugin_config::ConfigAI {
                    api_base: config.ai.api_base,
                    api_key: config.ai.api_key,
                    ai_specificity: config.ai.ai_specificity,
                    redemption_time_ms: config.ai.redemption_time_ms,
                };

                // Save to new store
                tauri_plugin_config::commands::set_general_config(
                    self.app_handle().clone(),
                    general,
                )
                .map_err(|e| format!("Failed to migrate general config: {}", e))?;

                tauri_plugin_config::commands::set_notification_config(
                    self.app_handle().clone(),
                    notification,
                )
                .map_err(|e| format!("Failed to migrate notification config: {}", e))?;

                tauri_plugin_config::commands::set_ai_config(self.app_handle().clone(), ai)
                    .map_err(|e| format!("Failed to migrate AI config: {}", e))?;

                tracing::info!("✅ Config migration completed successfully");
            } else {
                tracing::info!("No existing config to migrate");
            }
        }

        Ok(())
    }
}
