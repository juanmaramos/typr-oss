use super::{ProjectSourceChunk, UserDatabase};

impl UserDatabase {
    pub async fn replace_project_source_chunks(
        &self,
        project_id: impl Into<String>,
        source_type: impl Into<String>,
        source_id: impl Into<String>,
        chunks: Vec<ProjectSourceChunk>,
    ) -> Result<Vec<ProjectSourceChunk>, crate::Error> {
        let conn = self.conn()?;
        let project_id = project_id.into();
        let source_type = source_type.into();
        let source_id = source_id.into();

        conn.execute(
            "DELETE FROM project_source_chunks
             WHERE project_id = ? AND source_type = ? AND source_id = ?",
            vec![project_id, source_type, source_id],
        )
        .await?;

        let mut inserted = Vec::new();
        for chunk in chunks {
            let mut rows = conn
                .query(
                    "INSERT INTO project_source_chunks (
                        id,
                        project_id,
                        source_type,
                        source_id,
                        chunk_index,
                        source_locator,
                        title,
                        text_content,
                        content_hash,
                        char_count,
                        source_hash,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    RETURNING *",
                    vec![
                        libsql::Value::Text(chunk.id),
                        libsql::Value::Text(chunk.project_id),
                        libsql::Value::Text(chunk.source_type),
                        libsql::Value::Text(chunk.source_id),
                        libsql::Value::Integer(chunk.chunk_index),
                        chunk
                            .source_locator
                            .map(libsql::Value::Text)
                            .unwrap_or(libsql::Value::Null),
                        libsql::Value::Text(chunk.title),
                        libsql::Value::Text(chunk.text_content),
                        libsql::Value::Text(chunk.content_hash),
                        libsql::Value::Integer(chunk.char_count),
                        libsql::Value::Text(chunk.source_hash),
                        libsql::Value::Text(chunk.created_at.to_rfc3339()),
                        libsql::Value::Text(chunk.updated_at.to_rfc3339()),
                    ],
                )
                .await?;

            let row = rows.next().await?.unwrap();
            inserted.push(libsql::de::from_row(&row)?);
        }

        Ok(inserted)
    }

    pub async fn list_project_source_chunks(
        &self,
        project_id: impl Into<String>,
    ) -> Result<Vec<ProjectSourceChunk>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT * FROM project_source_chunks
                 WHERE project_id = ?
                 ORDER BY source_type ASC, source_id ASC, chunk_index ASC",
                vec![project_id.into()],
            )
            .await?;

        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(libsql::de::from_row(&row)?);
        }

        Ok(items)
    }
}
