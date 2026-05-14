use crate::user_common_derives;

user_common_derives! {
    pub struct UserTemplateFavorite {
        pub user_id: String,
        pub template_id: String,
        pub created_at: String,
    }
}

impl UserTemplateFavorite {
    pub fn from_row(row: &libsql::Row) -> Result<Self, serde::de::value::Error> {
        Ok(Self {
            user_id: row.get(0).expect("user_id"),
            template_id: row.get(1).expect("template_id"),
            created_at: row.get(2).expect("created_at"),
        })
    }
}
