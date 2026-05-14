use chrono::{DateTime, Utc};

use crate::user_common_derives;

user_common_derives! {
    pub struct Space {
        pub id: String,
        pub name: String,
        pub description: Option<String>,
        pub icon_type: String,
        pub icon_value: String,
        pub icon_color: String,
        pub created_at: DateTime<Utc>,
        pub updated_at: DateTime<Utc>,
    }
}

impl Space {
    pub fn from_row(row: &libsql::Row) -> Result<Self, serde::de::value::Error> {
        Ok(Self {
            id: row.get(0).expect("id"),
            name: row.get(1).expect("name"),
            description: row.get(2).expect("description"),
            icon_type: row.get(3).expect("icon_type"),
            icon_value: row.get(4).expect("icon_value"),
            icon_color: row.get(5).expect("icon_color"),
            created_at: {
                let value = row.get_str(6).expect("created_at");
                DateTime::parse_from_rfc3339(value)
                    .unwrap()
                    .with_timezone(&Utc)
            },
            updated_at: {
                let value = row.get_str(7).expect("updated_at");
                DateTime::parse_from_rfc3339(value)
                    .unwrap()
                    .with_timezone(&Utc)
            },
        })
    }
}
