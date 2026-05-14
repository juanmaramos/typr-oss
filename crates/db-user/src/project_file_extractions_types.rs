use crate::user_common_derives;

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum ProjectFileExtractionStatus {
        Pending,
        Done,
        Unsupported,
        Failed,
    }
}

user_common_derives! {
    pub struct ProjectFileExtraction {
        pub file_id: String,
        pub status: ProjectFileExtractionStatus,
        pub text_content: Option<String>,
        pub content_hash: Option<String>,
        pub char_count: i64,
        pub error_message: Option<String>,
        pub extracted_at: Option<chrono::DateTime<chrono::Utc>>,
        pub updated_at: chrono::DateTime<chrono::Utc>,
    }
}
