use crate::user_common_derives;

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum AskContextMode {
        ScopedAsk,
        BriefAnswering,
        BriefGeneration,
        BriefRefresh,
    }
}

user_common_derives! {
    pub struct AskContextSnapshot {
        pub id: String,
        pub thread_id: String,
        pub message_id: String,
        pub scope_type: super::AskScopeType,
        pub scope_id: Option<String>,
        pub context_mode: AskContextMode,
        pub model_id: Option<String>,
        pub source_count: i64,
        pub source_limit: i64,
        pub sources_json: String,
        pub messages_json: String,
        pub created_at: chrono::DateTime<chrono::Utc>,
    }
}
