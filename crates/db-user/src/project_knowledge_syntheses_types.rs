use crate::user_common_derives;

user_common_derives! {
    pub struct ProjectKnowledgeSynthesis {
        pub project_id: String,
        pub source_fingerprint: String,
        pub source_count: i64,
        pub model_id: Option<String>,
        pub key_claims_json: String,
        pub contradictions_json: String,
        pub changes_json: String,
        pub open_questions_json: String,
        pub synthesis_markdown: String,
        pub created_at: chrono::DateTime<chrono::Utc>,
        pub updated_at: chrono::DateTime<chrono::Utc>,
    }
}
