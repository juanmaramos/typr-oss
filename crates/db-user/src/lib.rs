mod ask_context_snapshots_ops;
mod ask_context_snapshots_types;
mod ask_messages_ops;
mod ask_messages_types;
mod ask_threads_ops;
mod ask_threads_types;
mod calendars_ops;
mod calendars_types;
mod chat_groups_ops;
mod chat_groups_types;
mod chat_messages_ops;
mod chat_messages_types;
mod config_ops;
mod config_types;
mod events_ops;
mod events_types;
mod extensions_ops;
mod extensions_types;
mod humans_ops;
mod humans_types;
mod organizations_ops;
mod organizations_types;
mod project_briefs_ops;
mod project_briefs_types;
mod project_file_extractions_ops;
mod project_file_extractions_types;
mod project_files_ops;
mod project_files_types;
mod project_knowledge_jobs_ops;
mod project_knowledge_jobs_types;
mod project_knowledge_syntheses_ops;
mod project_knowledge_syntheses_types;
mod project_source_chunks_ops;
mod project_source_chunks_types;
mod project_source_digests_ops;
mod project_source_digests_types;
mod project_sources_ops;
mod project_sources_types;
mod sessions_ops;
mod sessions_types;
mod spaces_ops;
mod spaces_types;
mod tags_ops;
mod tags_types;
mod templates_ops;
mod templates_types;
mod user_template_favorites_ops;
mod user_template_favorites_types;

#[allow(unused)]
pub use ask_context_snapshots_ops::*;
#[allow(unused)]
pub use ask_context_snapshots_types::*;
#[allow(unused)]
pub use ask_messages_ops::*;
#[allow(unused)]
pub use ask_messages_types::*;
#[allow(unused)]
pub use ask_threads_ops::*;
#[allow(unused)]
pub use ask_threads_types::*;
#[allow(unused)]
pub use calendars_ops::*;
#[allow(unused)]
pub use calendars_types::*;
#[allow(unused)]
pub use chat_groups_ops::*;
#[allow(unused)]
pub use chat_groups_types::*;
#[allow(unused)]
pub use chat_messages_ops::*;
#[allow(unused)]
pub use chat_messages_types::*;
#[allow(unused)]
pub use config_ops::*;
#[allow(unused)]
pub use config_types::*;
#[allow(unused)]
pub use events_ops::*;
#[allow(unused)]
pub use events_types::*;
#[allow(unused)]
pub use extensions_ops::*;
#[allow(unused)]
pub use extensions_types::*;
#[allow(unused)]
pub use humans_ops::*;
#[allow(unused)]
pub use humans_types::*;
#[allow(unused)]
pub use organizations_ops::*;
#[allow(unused)]
pub use organizations_types::*;
#[allow(unused)]
pub use project_briefs_ops::*;
#[allow(unused)]
pub use project_briefs_types::*;
#[allow(unused)]
pub use project_file_extractions_ops::*;
#[allow(unused)]
pub use project_file_extractions_types::*;
#[allow(unused)]
pub use project_files_ops::*;
#[allow(unused)]
pub use project_files_types::*;
#[allow(unused)]
pub use project_knowledge_jobs_ops::*;
#[allow(unused)]
pub use project_knowledge_jobs_types::*;
#[allow(unused)]
pub use project_knowledge_syntheses_ops::*;
#[allow(unused)]
pub use project_knowledge_syntheses_types::*;
#[allow(unused)]
pub use project_source_chunks_ops::*;
#[allow(unused)]
pub use project_source_chunks_types::*;
#[allow(unused)]
pub use project_source_digests_ops::*;
#[allow(unused)]
pub use project_source_digests_types::*;
#[allow(unused)]
pub use project_sources_ops::*;
#[allow(unused)]
pub use project_sources_types::*;
#[allow(unused)]
pub use sessions_ops::*;
#[allow(unused)]
pub use sessions_types::*;
#[allow(unused)]
pub use spaces_ops::*;
#[allow(unused)]
pub use spaces_types::*;
#[allow(unused)]
pub use tags_ops::*;
#[allow(unused)]
pub use tags_types::*;
#[allow(unused)]
pub use templates_ops::*;
#[allow(unused)]
pub use templates_types::*;
#[allow(unused)]
pub use user_template_favorites_ops::*;
#[allow(unused)]
pub use user_template_favorites_types::*;

pub mod init;

pub use typr_db_core::{Database, Error};

#[macro_export]
macro_rules! user_common_derives {
    (#[sql_table($table:expr)] $(#[$meta:meta])* $vis:vis $kind:ident $name:ident {
        $($body:tt)*
    }) => {
        #[derive(
            Debug,
            PartialEq,
            Clone,
            serde::Serialize,
            serde::Deserialize,
            specta::Type,
            schemars::JsonSchema,
        )]
        $(#[$meta])* $vis $kind $name {
            $($body)*
        }

        impl typr_db_core::SqlTable for $name {
            fn sql_table() -> &'static str {
                $table
            }
        }
    };

    ($item:item) => {
        #[derive(
            Debug,
            PartialEq,
            Clone,
            serde::Serialize,
            serde::Deserialize,
            specta::Type,
            schemars::JsonSchema,
        )]
        $item
    };
}

#[derive(Clone)]
pub struct UserDatabase {
    db: typr_db_core::Database,
}

impl UserDatabase {
    pub fn from(db: typr_db_core::Database) -> Self {
        Self { db }
    }
}

impl std::ops::Deref for UserDatabase {
    type Target = typr_db_core::Database;

    fn deref(&self) -> &Self::Target {
        &self.db
    }
}

// Append only. Do not reorder.
const MIGRATIONS: [&str; 43] = [
    include_str!("./calendars_migration.sql"),
    include_str!("./configs_migration.sql"),
    include_str!("./events_migration.sql"),
    include_str!("./humans_migration.sql"),
    include_str!("./organizations_migration.sql"),
    include_str!("./sessions_migration.sql"),
    include_str!("./session_participants_migration.sql"),
    include_str!("./templates_migration.sql"),
    include_str!("./chat_groups_migration.sql"),
    include_str!("./chat_messages_migration.sql"),
    include_str!("./extension_mappings_migration.sql"),
    include_str!("./tags_migration.sql"),
    include_str!("./tag_sessions_migration.sql"),
    include_str!("./calendars_migration_1.sql"),
    include_str!("./sessions_migration_1.sql"),
    include_str!("./sessions_migration_2.sql"),
    include_str!("./sessions_migration_3.sql"),
    include_str!("./sessions_migration_4.sql"),
    include_str!("./sessions_migration_5.sql"),
    include_str!("./chat_groups_migration_1.sql"),
    include_str!("./user_template_favorites_migration.sql"),
    include_str!("./sessions_migration_6.sql"),
    include_str!("./chat_messages_migration_1.sql"),
    include_str!("./tags_migration_1.sql"),
    include_str!("./spaces_migration.sql"),
    include_str!("./sessions_migration_7.sql"),
    include_str!("./sessions_migration_8.sql"),
    include_str!("./sessions_migration_9.sql"),
    include_str!("./spaces_migration_1.sql"),
    include_str!("./ask_threads_migration.sql"),
    include_str!("./ask_messages_migration.sql"),
    include_str!("./ask_context_snapshots_migration.sql"),
    include_str!("./project_files_migration.sql"),
    include_str!("./project_file_extractions_migration.sql"),
    include_str!("./project_sources_migration.sql"),
    include_str!("./project_source_chunks_migration.sql"),
    include_str!("./project_source_digests_migration.sql"),
    include_str!("./project_briefs_migration.sql"),
    include_str!("./project_brief_sources_migration.sql"),
    include_str!("./project_brief_refreshes_migration.sql"),
    include_str!("./project_knowledge_jobs_migration.sql"),
    include_str!("./project_source_digests_migration_1.sql"),
    include_str!("./project_knowledge_syntheses_migration.sql"),
];

pub async fn migrate(db: &UserDatabase) -> Result<(), crate::Error> {
    let conn = db.conn()?;
    typr_db_core::migrate(&conn, MIGRATIONS.to_vec()).await?;
    ensure_project_knowledge_schema(&conn).await?;

    typr_db_script::conversation_to_words::run(&conn).await;

    Ok(())
}

async fn ensure_project_knowledge_schema(conn: &libsql::Connection) -> Result<(), crate::Error> {
    // Some dev databases from this sprint reached the latest PRAGMA user_version
    // before the project knowledge tables existed. These CREATE IF NOT EXISTS
    // guards keep existing data intact and make the compiled-knowledge path
    // reliable without resetting local state.
    for migration in [
        include_str!("./project_source_chunks_migration.sql"),
        include_str!("./project_source_digests_migration.sql"),
        include_str!("./project_knowledge_jobs_migration.sql"),
        include_str!("./project_knowledge_syntheses_migration.sql"),
    ] {
        let statements = migration
            .split(';')
            .map(str::trim)
            .filter(|statement| !statement.is_empty());

        for statement in statements {
            conn.execute(statement, ()).await?;
        }
    }

    let mut rows = conn
        .query("PRAGMA table_info(project_source_digests)", ())
        .await?;
    let mut has_contradictions_json = false;
    while let Some(row) = rows.next().await? {
        let column_name: String = row.get(1)?;
        if column_name == "contradictions_json" {
            has_contradictions_json = true;
            break;
        }
    }

    if !has_contradictions_json {
        conn.execute(
            "ALTER TABLE project_source_digests
             ADD COLUMN contradictions_json TEXT NOT NULL DEFAULT '[]'",
            (),
        )
        .await?;
    }

    Ok(())
}

// Build-time validation: Ensure migration array stays in sync with files
#[cfg(test)]
mod migration_validation {
    use super::*;

    #[test]
    fn migration_array_completeness() {
        // Count actual migration files in source directory
        let migration_files = std::fs::read_dir(env!("CARGO_MANIFEST_DIR").to_owned() + "/src")
            .expect("Failed to read src directory")
            .filter_map(|entry| {
                let path = entry.ok()?.path();
                let filename = path.file_name()?.to_str()?;
                if filename.contains("_migration") && filename.ends_with(".sql") {
                    Some(filename.to_string())
                } else {
                    None
                }
            })
            .count();

        assert_eq!(
            MIGRATIONS.len(),
            migration_files,
            "MIGRATIONS array length ({}) doesn't match migration files count ({}). \
             Did you forget to add a new migration to the MIGRATIONS array?",
            MIGRATIONS.len(),
            migration_files
        );
    }
}

#[cfg(test)]
mod tests {
    use super::UserDatabase;
    use crate::{init, migrate};
    use typr_db_core::DatabaseBuilder;

    pub async fn setup_db() -> UserDatabase {
        let base_db = DatabaseBuilder::default().memory().build().await.unwrap();
        let user_db = UserDatabase::from(base_db);
        migrate(&user_db).await.unwrap();
        user_db
    }

    #[tokio::test]
    async fn test_seed() {
        let db = setup_db().await;
        let user_id = uuid::Uuid::new_v4().to_string();
        init::seed(&db, user_id).await.unwrap();
    }

    #[tokio::test]
    async fn migrate_repairs_missing_project_knowledge_tables() {
        let base_db = DatabaseBuilder::default().memory().build().await.unwrap();
        let conn = base_db.conn().unwrap();
        conn.execute("PRAGMA user_version = 41", ()).await.unwrap();

        let user_db = UserDatabase::from(base_db);
        migrate(&user_db).await.unwrap();

        for table in [
            "project_source_chunks",
            "project_source_digests",
            "project_knowledge_jobs",
        ] {
            let mut rows = conn
                .query(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
                    vec![table],
                )
                .await
                .unwrap();
            assert!(rows.next().await.unwrap().is_some(), "{table} should exist");
        }

        let mut columns = conn
            .query("PRAGMA table_info(project_source_digests)", ())
            .await
            .unwrap();
        let mut has_contradictions_json = false;
        while let Some(row) = columns.next().await.unwrap() {
            let column_name: String = row.get(1).unwrap();
            if column_name == "contradictions_json" {
                has_contradictions_json = true;
                break;
            }
        }
        assert!(has_contradictions_json, "contradictions_json should exist");
    }
}
