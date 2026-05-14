use super::{AskMessage, AskMessageRole, UserDatabase};

fn title_from_prompt(prompt: &str) -> String {
    let title = prompt.split_whitespace().collect::<Vec<_>>().join(" ");

    if title.chars().count() <= 72 {
        return title;
    }

    format!("{}...", title.chars().take(69).collect::<String>())
}

impl UserDatabase {
    pub async fn upsert_ask_message(
        &self,
        message: AskMessage,
    ) -> Result<AskMessage, crate::Error> {
        let conn = self.conn()?;
        let thread_id = message.thread_id.clone();
        let first_user_title = matches!(message.role, AskMessageRole::User)
            .then(|| title_from_prompt(&message.content))
            .filter(|title| !title.is_empty());
        let created_at = message.created_at;

        let mut rows = conn
            .query(
                "INSERT INTO ask_messages (
                    id,
                    thread_id,
                    role,
                    content,
                    status,
                    created_at,
                    model_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    thread_id = excluded.thread_id,
                    role = excluded.role,
                    content = excluded.content,
                    status = excluded.status,
                    created_at = excluded.created_at,
                    model_id = excluded.model_id
                RETURNING *",
                vec![
                    libsql::Value::Text(message.id),
                    libsql::Value::Text(message.thread_id),
                    libsql::Value::Text(message.role.to_string()),
                    libsql::Value::Text(message.content),
                    libsql::Value::Text(message.status.to_string()),
                    libsql::Value::Text(message.created_at.to_rfc3339()),
                    message
                        .model_id
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                ],
            )
            .await?;

        self.touch_ask_thread_after_message(thread_id, created_at, first_user_title)
            .await?;

        let row = rows.next().await?.unwrap();
        let message: AskMessage = libsql::de::from_row(&row)?;
        Ok(message)
    }

    pub async fn list_ask_messages(
        &self,
        thread_id: impl Into<String>,
    ) -> Result<Vec<AskMessage>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT * FROM ask_messages
                 WHERE thread_id = ?
                 ORDER BY created_at ASC",
                vec![thread_id.into()],
            )
            .await?;

        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(libsql::de::from_row(&row)?);
        }
        Ok(items)
    }
}
