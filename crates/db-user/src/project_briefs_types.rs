use crate::user_common_derives;

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum ProjectBriefStatus {
        Current,
        NeedsRefresh,
        Building,
        Failed,
    }
}

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum ProjectBriefRefreshStatus {
        Running,
        Complete,
        Failed,
    }
}

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum ProjectBriefRefreshMode {
        Initial,
        Incremental,
        FullRebuild,
    }
}

user_common_derives! {
    pub struct ProjectBrief {
        pub id: String,
        pub project_id: String,
        pub markdown: String,
        pub status: ProjectBriefStatus,
        pub source_count: i64,
        pub source_limit: i64,
        pub source_fingerprint: String,
        pub model_id: Option<String>,
        pub prompt_template_version: String,
        pub error_message: Option<String>,
        pub generated_at: Option<chrono::DateTime<chrono::Utc>>,
        pub created_at: chrono::DateTime<chrono::Utc>,
        pub updated_at: chrono::DateTime<chrono::Utc>,
    }
}

user_common_derives! {
    pub struct ProjectBriefSource {
        pub brief_id: String,
        pub source_type: String,
        pub source_id: String,
        pub source_key: String,
        pub title: String,
        pub content_hash: String,
        pub created_at: chrono::DateTime<chrono::Utc>,
    }
}

user_common_derives! {
    pub struct ProjectBriefRefresh {
        pub id: String,
        pub project_id: String,
        pub brief_id: Option<String>,
        pub status: ProjectBriefRefreshStatus,
        pub refresh_mode: ProjectBriefRefreshMode,
        pub model_id: Option<String>,
        pub error_message: Option<String>,
        pub started_at: chrono::DateTime<chrono::Utc>,
        pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    }
}
