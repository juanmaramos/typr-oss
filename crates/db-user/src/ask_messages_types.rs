use crate::user_common_derives;

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum AskMessageRole {
        User,
        Assistant,
        System,
    }
}

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum AskMessageStatus {
        Pending,
        Streaming,
        Complete,
        Failed,
    }
}

user_common_derives! {
    pub struct AskMessage {
        pub id: String,
        pub thread_id: String,
        pub role: AskMessageRole,
        pub content: String,
        pub status: AskMessageStatus,
        pub created_at: chrono::DateTime<chrono::Utc>,
        pub model_id: Option<String>,
    }
}
