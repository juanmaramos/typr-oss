use crate::user_common_derives;

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum ProjectSourceDigestSourceKind {
        ExistingAiNotes,
        GeneratedFromChunks,
        ManualFallback,
    }
}

user_common_derives! {
    pub struct ProjectSourceDigest {
        pub project_id: String,
        pub source_type: String,
        pub source_id: String,
        pub title: String,
        pub digest_source_kind: ProjectSourceDigestSourceKind,
        pub source_hash: String,
        pub summary: String,
        pub claims_json: String,
        pub entities_json: String,
        pub open_questions_json: String,
        pub decisions_json: String,
        pub risks_json: String,
        pub contradictions_json: String,
        pub digest_markdown: String,
        pub created_at: chrono::DateTime<chrono::Utc>,
        pub updated_at: chrono::DateTime<chrono::Utc>,
    }
}
