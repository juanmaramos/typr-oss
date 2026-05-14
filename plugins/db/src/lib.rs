use tauri::Manager;
use tokio::sync::Mutex;

mod commands;
mod error;
mod ext;

pub use error::{Error, Result};
pub use ext::DatabasePluginExt;

pub type ManagedState = Mutex<State>;

#[derive(Default)]
pub struct State {
    pub user_id: Option<String>,
    pub db: Option<typr_db_user::UserDatabase>,
}

const PLUGIN_NAME: &str = "db";

pub fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::events::get_event,
            commands::events::list_events,
            commands::calendars::get_calendar,
            commands::calendars::list_calendars,
            commands::calendars::upsert_calendar,
            commands::calendars::toggle_calendar_selected,
            commands::sessions::upsert_session,
            commands::sessions::visit_session,
            commands::templates::list_templates,
            commands::templates::upsert_template,
            commands::templates::delete_template,
            commands::templates::toggle_template_favorite,
            commands::templates::get_favorite_templates,
            commands::templates::is_template_favorited,
            commands::sessions::onboarding_session_id,
            commands::sessions::thank_you_session_id,
            commands::sessions::list_sessions,
            commands::sessions::delete_session,
            commands::sessions::get_session,
            commands::sessions::set_session_event,
            commands::sessions::session_add_participant,
            commands::sessions::session_remove_participant,
            commands::sessions::session_list_participants,
            commands::sessions::session_get_event,
            commands::sessions::get_words,
            commands::sessions::get_words_onboarding,
            commands::sessions::initialize_user_onboarding,
            commands::sessions::create_onboarding_note,
            commands::configs::get_config,
            commands::configs::set_config,
            commands::humans::get_human,
            commands::humans::upsert_human,
            commands::humans::list_humans,
            commands::organizations::get_organization,
            commands::organizations::get_organization_by_user_id,
            commands::organizations::upsert_organization,
            commands::organizations::list_organizations,
            commands::organizations::list_organization_members,
            commands::chats::list_chat_groups,
            commands::chats::list_chat_messages,
            commands::chats::create_chat_group,
            commands::chats::upsert_chat_message,
            commands::chats::delete_chat_messages,
            commands::ask::create_ask_thread,
            commands::ask::get_ask_thread,
            commands::ask::list_ask_threads,
            commands::ask::archive_ask_thread,
            commands::ask::upsert_ask_message,
            commands::ask::list_ask_messages,
            commands::ask::upsert_ask_context_snapshot,
            commands::ask::list_ask_context_snapshots,
            commands::project_files::upsert_project_file,
            commands::project_files::list_project_files,
            commands::project_files::delete_project_file,
            commands::project_files::upsert_project_file_extraction,
            commands::project_files::list_project_file_extractions,
            commands::project_knowledge_jobs::enqueue_project_knowledge_job,
            commands::project_knowledge_jobs::list_project_knowledge_jobs,
            commands::project_knowledge_jobs::claim_next_project_knowledge_job,
            commands::project_knowledge_jobs::complete_project_knowledge_job,
            commands::project_knowledge_jobs::retry_project_knowledge_job,
            commands::project_knowledge_jobs::release_project_knowledge_job,
            commands::project_knowledge_jobs::fail_project_knowledge_job,
            commands::project_knowledge_jobs::reclaim_stale_project_knowledge_jobs,
            commands::project_knowledge_syntheses::upsert_project_knowledge_synthesis,
            commands::project_knowledge_syntheses::get_project_knowledge_synthesis,
            commands::project_source_chunks::replace_project_source_chunks,
            commands::project_source_chunks::list_project_source_chunks,
            commands::project_source_digests::upsert_project_source_digest,
            commands::project_source_digests::list_project_source_digests,
            commands::project_sources::list_project_sources,
            commands::project_sources::set_project_source_status,
            commands::project_sources::add_project_source,
            commands::project_sources::remove_project_source,
            commands::project_briefs::upsert_project_brief,
            commands::project_briefs::get_latest_project_brief,
            commands::project_briefs::replace_project_brief_sources,
            commands::project_briefs::list_project_brief_sources,
            commands::project_briefs::upsert_project_brief_refresh,
            commands::spaces::list_spaces,
            commands::spaces::get_space,
            commands::spaces::create_space,
            commands::spaces::update_space,
            commands::spaces::delete_space,
            commands::spaces::assign_session_to_space,
            commands::spaces::clear_session_space,
            commands::spaces::list_sessions_by_space,
            commands::spaces::list_included_sessions_by_space,
            commands::spaces::list_projects_by_session,
            commands::tags::list_all_tags,
            commands::tags::list_session_tags,
            commands::tags::assign_tag_to_session,
            commands::tags::unassign_tag_from_session,
            commands::tags::upsert_tag,
            commands::tags::delete_tag,
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(|app, _api| {
            app.manage(ManagedState::default());
            Ok(())
        })
        .build()
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
                "./js/bindings.gen.ts",
            )
            .unwrap()
    }

    fn create_app<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::App<R> {
        builder
            .plugin(init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap()
    }

    #[test]
    fn test_db() {
        let _app = create_app(tauri::test::mock_builder());
    }
}
