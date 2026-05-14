use super::{AskScopeType, AskThread, UserDatabase};

impl UserDatabase {
    pub async fn create_ask_thread(&self, thread: AskThread) -> Result<AskThread, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "INSERT INTO ask_threads (
                    id,
                    user_id,
                    scope_type,
                    scope_id,
                    title,
                    created_at,
                    updated_at,
                    last_message_at,
                    archived_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING *",
                vec![
                    libsql::Value::Text(thread.id),
                    libsql::Value::Text(thread.user_id),
                    libsql::Value::Text(thread.scope_type.to_string()),
                    thread
                        .scope_id
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    thread
                        .title
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Text(thread.created_at.to_rfc3339()),
                    libsql::Value::Text(thread.updated_at.to_rfc3339()),
                    thread
                        .last_message_at
                        .map(|value| libsql::Value::Text(value.to_rfc3339()))
                        .unwrap_or(libsql::Value::Null),
                    thread
                        .archived_at
                        .map(|value| libsql::Value::Text(value.to_rfc3339()))
                        .unwrap_or(libsql::Value::Null),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        let thread: AskThread = libsql::de::from_row(&row)?;
        Ok(thread)
    }

    pub async fn get_ask_thread(
        &self,
        thread_id: impl Into<String>,
    ) -> Result<Option<AskThread>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT * FROM ask_threads WHERE id = ?",
                vec![thread_id.into()],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(libsql::de::from_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn list_ask_threads(
        &self,
        user_id: impl Into<String>,
        scope_type: Option<AskScopeType>,
        scope_id: Option<String>,
    ) -> Result<Vec<AskThread>, crate::Error> {
        let conn = self.conn()?;
        let user_id = user_id.into();

        let mut rows = match (scope_type, scope_id) {
            (Some(scope_type), Some(scope_id)) => {
                conn.query(
                    "SELECT * FROM ask_threads
                     WHERE user_id = ? AND archived_at IS NULL AND scope_type = ? AND scope_id = ?
                     ORDER BY updated_at DESC",
                    vec![user_id, scope_type.to_string(), scope_id],
                )
                .await?
            }
            (Some(scope_type), None) => {
                conn.query(
                    "SELECT * FROM ask_threads
                     WHERE user_id = ? AND archived_at IS NULL AND scope_type = ?
                     ORDER BY updated_at DESC",
                    vec![user_id, scope_type.to_string()],
                )
                .await?
            }
            _ => {
                conn.query(
                    "SELECT * FROM ask_threads
                     WHERE user_id = ? AND archived_at IS NULL
                     ORDER BY updated_at DESC",
                    vec![user_id],
                )
                .await?
            }
        };

        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(libsql::de::from_row(&row)?);
        }
        Ok(items)
    }

    pub async fn touch_ask_thread_after_message(
        &self,
        thread_id: impl Into<String>,
        last_message_at: chrono::DateTime<chrono::Utc>,
        title_if_missing: Option<String>,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE ask_threads
             SET updated_at = ?,
                 last_message_at = ?,
                 title = COALESCE(title, ?)
             WHERE id = ?",
            vec![
                libsql::Value::Text(last_message_at.to_rfc3339()),
                libsql::Value::Text(last_message_at.to_rfc3339()),
                title_if_missing
                    .map(libsql::Value::Text)
                    .unwrap_or(libsql::Value::Null),
                libsql::Value::Text(thread_id.into()),
            ],
        )
        .await?;
        Ok(())
    }

    pub async fn archive_ask_thread(
        &self,
        thread_id: impl Into<String>,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE ask_threads
             SET archived_at = ?,
                 updated_at = ?
             WHERE id = ?",
            vec![now.clone(), now, thread_id.into()],
        )
        .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::{tests::setup_db, AskScopeType, AskThread, Human};

    #[tokio::test]
    async fn archived_ask_threads_are_hidden_from_lists() {
        let db = setup_db().await;
        let user = db
            .upsert_human(Human {
                full_name: Some("Ask Owner".to_string()),
                ..Human::default()
            })
            .await
            .unwrap();
        let now = chrono::Utc::now();
        let thread = db
            .create_ask_thread(AskThread {
                id: uuid::Uuid::new_v4().to_string(),
                user_id: user.id.clone(),
                scope_type: AskScopeType::Project,
                scope_id: Some(uuid::Uuid::new_v4().to_string()),
                title: Some("Project question".to_string()),
                created_at: now,
                updated_at: now,
                last_message_at: None,
                archived_at: None,
            })
            .await
            .unwrap();

        assert_eq!(
            db.list_ask_threads(user.id.clone(), None, None)
                .await
                .unwrap()
                .len(),
            1
        );

        db.archive_ask_thread(thread.id.clone()).await.unwrap();

        assert!(db
            .list_ask_threads(user.id, None, None)
            .await
            .unwrap()
            .is_empty());
        assert!(db
            .get_ask_thread(thread.id)
            .await
            .unwrap()
            .unwrap()
            .archived_at
            .is_some());
    }
}
