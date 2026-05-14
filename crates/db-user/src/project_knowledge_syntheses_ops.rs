use super::{ProjectKnowledgeSynthesis, UserDatabase};

impl UserDatabase {
    pub async fn upsert_project_knowledge_synthesis(
        &self,
        synthesis: ProjectKnowledgeSynthesis,
    ) -> Result<ProjectKnowledgeSynthesis, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "INSERT INTO project_knowledge_syntheses (
                    project_id,
                    source_fingerprint,
                    source_count,
                    model_id,
                    key_claims_json,
                    contradictions_json,
                    changes_json,
                    open_questions_json,
                    synthesis_markdown,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id) DO UPDATE SET
                    source_fingerprint = excluded.source_fingerprint,
                    source_count = excluded.source_count,
                    model_id = excluded.model_id,
                    key_claims_json = excluded.key_claims_json,
                    contradictions_json = excluded.contradictions_json,
                    changes_json = excluded.changes_json,
                    open_questions_json = excluded.open_questions_json,
                    synthesis_markdown = excluded.synthesis_markdown,
                    updated_at = excluded.updated_at
                RETURNING *",
                vec![
                    libsql::Value::Text(synthesis.project_id),
                    libsql::Value::Text(synthesis.source_fingerprint),
                    libsql::Value::Integer(synthesis.source_count),
                    synthesis
                        .model_id
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Text(synthesis.key_claims_json),
                    libsql::Value::Text(synthesis.contradictions_json),
                    libsql::Value::Text(synthesis.changes_json),
                    libsql::Value::Text(synthesis.open_questions_json),
                    libsql::Value::Text(synthesis.synthesis_markdown),
                    libsql::Value::Text(synthesis.created_at.to_rfc3339()),
                    libsql::Value::Text(synthesis.updated_at.to_rfc3339()),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        Ok(libsql::de::from_row(&row)?)
    }

    pub async fn get_project_knowledge_synthesis(
        &self,
        project_id: impl Into<String>,
    ) -> Result<Option<ProjectKnowledgeSynthesis>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT * FROM project_knowledge_syntheses WHERE project_id = ?",
                vec![project_id.into()],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(libsql::de::from_row(&row)?)),
            None => Ok(None),
        }
    }
}
