use crate::user_common_derives;

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum ProjectSourceStatus {
        Included,
        ExcludedFromBrief,
        NeedsReview,
    }
}

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum ProjectSourceAddedBy {
        User,
        System,
    }
}

user_common_derives! {
    pub struct ProjectSource {
        pub project_id: String,
        pub session_id: String,
        pub status: ProjectSourceStatus,
        pub added_by: ProjectSourceAddedBy,
        pub relevance_score: Option<f64>,
        pub relevance_reason: Option<String>,
        pub reviewed_at: Option<chrono::DateTime<chrono::Utc>>,
        pub created_at: chrono::DateTime<chrono::Utc>,
        pub updated_at: chrono::DateTime<chrono::Utc>,
    }
}
