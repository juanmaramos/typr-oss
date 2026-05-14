use crate::user_common_derives;

user_common_derives! {
    pub struct ProjectSourceChunk {
        pub id: String,
        pub project_id: String,
        pub source_type: String,
        pub source_id: String,
        pub chunk_index: i64,
        pub source_locator: Option<String>,
        pub title: String,
        pub text_content: String,
        pub content_hash: String,
        pub char_count: i64,
        pub source_hash: String,
        pub created_at: chrono::DateTime<chrono::Utc>,
        pub updated_at: chrono::DateTime<chrono::Utc>,
    }
}
