use crate::user_common_derives;

user_common_derives! {
    #[derive(strum::EnumString, strum::Display)]
    pub enum ProjectFileStatus {
        Queued,
        Importing,
        Done,
        Failed,
    }
}

user_common_derives! {
    pub struct ProjectFile {
        pub id: String,
        pub project_id: String,
        pub name: String,
        pub mime_type: Option<String>,
        pub size_bytes: i64,
        pub storage_path: String,
        pub status: ProjectFileStatus,
        pub error_message: Option<String>,
        pub created_at: chrono::DateTime<chrono::Utc>,
        pub updated_at: chrono::DateTime<chrono::Utc>,
    }
}
