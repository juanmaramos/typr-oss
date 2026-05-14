use super::{ProjectSource, ProjectSourceAddedBy, ProjectSourceStatus, UserDatabase};

impl UserDatabase {
    pub async fn upsert_project_source(
        &self,
        source: ProjectSource,
    ) -> Result<ProjectSource, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "INSERT INTO project_sources (
                    project_id,
                    session_id,
                    status,
                    added_by,
                    relevance_score,
                    relevance_reason,
                    reviewed_at,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id, session_id) DO UPDATE SET
                    status = excluded.status,
                    added_by = excluded.added_by,
                    relevance_score = excluded.relevance_score,
                    relevance_reason = excluded.relevance_reason,
                    reviewed_at = excluded.reviewed_at,
                    updated_at = excluded.updated_at
                RETURNING *",
                vec![
                    libsql::Value::Text(source.project_id),
                    libsql::Value::Text(source.session_id),
                    libsql::Value::Text(source.status.to_string()),
                    libsql::Value::Text(source.added_by.to_string()),
                    source
                        .relevance_score
                        .map(libsql::Value::Real)
                        .unwrap_or(libsql::Value::Null),
                    source
                        .relevance_reason
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    source
                        .reviewed_at
                        .map(|value| libsql::Value::Text(value.to_rfc3339()))
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Text(source.created_at.to_rfc3339()),
                    libsql::Value::Text(source.updated_at.to_rfc3339()),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        let source: ProjectSource = libsql::de::from_row(&row)?;
        Ok(source)
    }

    pub async fn list_project_sources(
        &self,
        project_id: impl Into<String>,
    ) -> Result<Vec<ProjectSource>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT * FROM project_sources
                 WHERE project_id = ?
                 ORDER BY updated_at DESC",
                vec![project_id.into()],
            )
            .await?;

        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(libsql::de::from_row(&row)?);
        }

        Ok(items)
    }

    pub async fn set_project_source_status(
        &self,
        project_id: impl Into<String>,
        session_id: impl Into<String>,
        status: ProjectSourceStatus,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE project_sources
             SET status = ?,
                 reviewed_at = ?,
                 updated_at = ?
             WHERE project_id = ? AND session_id = ?",
            vec![
                libsql::Value::Text(status.to_string()),
                libsql::Value::Text(now.clone()),
                libsql::Value::Text(now),
                libsql::Value::Text(project_id.into()),
                libsql::Value::Text(session_id.into()),
            ],
        )
        .await?;

        Ok(())
    }

    pub async fn delete_project_source(
        &self,
        project_id: impl Into<String>,
        session_id: impl Into<String>,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;

        conn.execute(
            "DELETE FROM project_sources WHERE project_id = ? AND session_id = ?",
            vec![project_id.into(), session_id.into()],
        )
        .await?;

        Ok(())
    }

    pub async fn create_included_project_source(
        &self,
        project_id: String,
        session_id: String,
    ) -> Result<ProjectSource, crate::Error> {
        let now = chrono::Utc::now();
        self.upsert_project_source(ProjectSource {
            project_id,
            session_id,
            status: ProjectSourceStatus::Included,
            added_by: ProjectSourceAddedBy::User,
            relevance_score: None,
            relevance_reason: None,
            reviewed_at: Some(now),
            created_at: now,
            updated_at: now,
        })
        .await
    }
}
