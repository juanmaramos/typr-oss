use super::{ProjectSourceDigest, UserDatabase};

impl UserDatabase {
    pub async fn delete_project_source_knowledge(
        &self,
        project_id: impl Into<String>,
        source_type: impl Into<String>,
        source_id: impl Into<String>,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;
        let project_id = project_id.into();
        let source_type = source_type.into();
        let source_id = source_id.into();

        conn.execute(
            "DELETE FROM project_source_chunks
             WHERE project_id = ? AND source_type = ? AND source_id = ?",
            vec![project_id.clone(), source_type.clone(), source_id.clone()],
        )
        .await?;

        conn.execute(
            "DELETE FROM project_source_digests
             WHERE project_id = ? AND source_type = ? AND source_id = ?",
            vec![project_id, source_type, source_id],
        )
        .await?;

        Ok(())
    }

    pub async fn upsert_project_source_digest(
        &self,
        digest: ProjectSourceDigest,
    ) -> Result<ProjectSourceDigest, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "INSERT INTO project_source_digests (
                    project_id,
                    source_type,
                    source_id,
                    title,
                    digest_source_kind,
                    source_hash,
                    summary,
                    claims_json,
                    entities_json,
                    open_questions_json,
                    decisions_json,
                    risks_json,
                    contradictions_json,
                    digest_markdown,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id, source_type, source_id) DO UPDATE SET
                    title = excluded.title,
                    digest_source_kind = excluded.digest_source_kind,
                    source_hash = excluded.source_hash,
                    summary = excluded.summary,
                    claims_json = excluded.claims_json,
                    entities_json = excluded.entities_json,
                    open_questions_json = excluded.open_questions_json,
                    decisions_json = excluded.decisions_json,
                    risks_json = excluded.risks_json,
                    contradictions_json = excluded.contradictions_json,
                    digest_markdown = excluded.digest_markdown,
                    updated_at = excluded.updated_at
                RETURNING *",
                vec![
                    libsql::Value::Text(digest.project_id),
                    libsql::Value::Text(digest.source_type),
                    libsql::Value::Text(digest.source_id),
                    libsql::Value::Text(digest.title),
                    libsql::Value::Text(digest.digest_source_kind.to_string()),
                    libsql::Value::Text(digest.source_hash),
                    libsql::Value::Text(digest.summary),
                    libsql::Value::Text(digest.claims_json),
                    libsql::Value::Text(digest.entities_json),
                    libsql::Value::Text(digest.open_questions_json),
                    libsql::Value::Text(digest.decisions_json),
                    libsql::Value::Text(digest.risks_json),
                    libsql::Value::Text(digest.contradictions_json),
                    libsql::Value::Text(digest.digest_markdown),
                    libsql::Value::Text(digest.created_at.to_rfc3339()),
                    libsql::Value::Text(digest.updated_at.to_rfc3339()),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        Ok(libsql::de::from_row(&row)?)
    }

    pub async fn list_project_source_digests(
        &self,
        project_id: impl Into<String>,
    ) -> Result<Vec<ProjectSourceDigest>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT * FROM project_source_digests
                 WHERE project_id = ?
                 ORDER BY updated_at DESC, LOWER(title) ASC",
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
