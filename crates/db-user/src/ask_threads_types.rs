use crate::user_common_derives;

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum AskScopeType {
        Project,
        Note,
        Workspace,
    }
}

user_common_derives! {
    pub struct AskThread {
        pub id: String,
        pub user_id: String,
        pub scope_type: AskScopeType,
        pub scope_id: Option<String>,
        pub title: Option<String>,
        pub created_at: chrono::DateTime<chrono::Utc>,
        pub updated_at: chrono::DateTime<chrono::Utc>,
        pub last_message_at: Option<chrono::DateTime<chrono::Utc>>,
        pub archived_at: Option<chrono::DateTime<chrono::Utc>>,
    }
}
