use crate::user_common_derives;

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum ProjectKnowledgeJobType {
        SourceDigest,
        ProjectSynthesis,
        ProjectBriefRefresh,
    }
}

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum ProjectKnowledgeJobStatus {
        Queued,
        Running,
        Complete,
        Failed,
    }
}

user_common_derives! {
    pub struct ProjectKnowledgeJob {
        pub id: String,
        pub project_id: String,
        pub job_type: ProjectKnowledgeJobType,
        pub status: ProjectKnowledgeJobStatus,
        pub dedupe_key: String,
        pub source_type: Option<String>,
        pub source_id: Option<String>,
        pub model_id: Option<String>,
        pub attempt_count: i64,
        pub error_message: Option<String>,
        pub run_after: chrono::DateTime<chrono::Utc>,
        pub queued_at: chrono::DateTime<chrono::Utc>,
        pub started_at: Option<chrono::DateTime<chrono::Utc>>,
        pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
        pub updated_at: chrono::DateTime<chrono::Utc>,
    }
}
