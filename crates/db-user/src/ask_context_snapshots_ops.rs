use super::{AskContextSnapshot, UserDatabase};

impl UserDatabase {
    pub async fn upsert_ask_context_snapshot(
        &self,
        snapshot: AskContextSnapshot,
    ) -> Result<AskContextSnapshot, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "INSERT INTO ask_context_snapshots (
                    id,
                    thread_id,
                    message_id,
                    scope_type,
                    scope_id,
                    context_mode,
                    model_id,
                    source_count,
                    source_limit,
                    sources_json,
                    messages_json,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    thread_id = excluded.thread_id,
                    message_id = excluded.message_id,
                    scope_type = excluded.scope_type,
                    scope_id = excluded.scope_id,
                    context_mode = excluded.context_mode,
                    model_id = excluded.model_id,
                    source_count = excluded.source_count,
                    source_limit = excluded.source_limit,
                    sources_json = excluded.sources_json,
                    messages_json = excluded.messages_json,
                    created_at = excluded.created_at
                RETURNING *",
                vec![
                    libsql::Value::Text(snapshot.id),
                    libsql::Value::Text(snapshot.thread_id),
                    libsql::Value::Text(snapshot.message_id),
                    libsql::Value::Text(snapshot.scope_type.to_string()),
                    snapshot
                        .scope_id
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Text(snapshot.context_mode.to_string()),
                    snapshot
                        .model_id
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Integer(snapshot.source_count),
                    libsql::Value::Integer(snapshot.source_limit),
                    libsql::Value::Text(snapshot.sources_json),
                    libsql::Value::Text(snapshot.messages_json),
                    libsql::Value::Text(snapshot.created_at.to_rfc3339()),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        let snapshot: AskContextSnapshot = libsql::de::from_row(&row)?;
        Ok(snapshot)
    }

    pub async fn list_ask_context_snapshots(
        &self,
        thread_id: impl Into<String>,
    ) -> Result<Vec<AskContextSnapshot>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT * FROM ask_context_snapshots
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
