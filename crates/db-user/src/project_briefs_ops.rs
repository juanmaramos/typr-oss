use super::{ProjectBrief, ProjectBriefRefresh, ProjectBriefSource, UserDatabase};

impl UserDatabase {
    pub async fn upsert_project_brief(
        &self,
        brief: ProjectBrief,
    ) -> Result<ProjectBrief, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "INSERT INTO project_briefs (
                    id,
                    project_id,
                    markdown,
                    status,
                    source_count,
                    source_limit,
                    source_fingerprint,
                    model_id,
                    prompt_template_version,
                    error_message,
                    generated_at,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    markdown = excluded.markdown,
                    status = excluded.status,
                    source_count = excluded.source_count,
                    source_limit = excluded.source_limit,
                    source_fingerprint = excluded.source_fingerprint,
                    model_id = excluded.model_id,
                    prompt_template_version = excluded.prompt_template_version,
                    error_message = excluded.error_message,
                    generated_at = excluded.generated_at,
                    updated_at = excluded.updated_at
                RETURNING *",
                vec![
                    libsql::Value::Text(brief.id),
                    libsql::Value::Text(brief.project_id),
                    libsql::Value::Text(brief.markdown),
                    libsql::Value::Text(brief.status.to_string()),
                    libsql::Value::Integer(brief.source_count),
                    libsql::Value::Integer(brief.source_limit),
                    libsql::Value::Text(brief.source_fingerprint),
                    brief
                        .model_id
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Text(brief.prompt_template_version),
                    brief
                        .error_message
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    brief
                        .generated_at
                        .map(|value| libsql::Value::Text(value.to_rfc3339()))
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Text(brief.created_at.to_rfc3339()),
                    libsql::Value::Text(brief.updated_at.to_rfc3339()),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        let brief: ProjectBrief = libsql::de::from_row(&row)?;
        Ok(brief)
    }

    pub async fn get_latest_project_brief(
        &self,
        project_id: impl Into<String>,
    ) -> Result<Option<ProjectBrief>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT * FROM project_briefs
                 WHERE project_id = ?
                 ORDER BY updated_at DESC
                 LIMIT 1",
                vec![project_id.into()],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(libsql::de::from_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn replace_project_brief_sources(
        &self,
        brief_id: impl Into<String>,
        sources: Vec<ProjectBriefSource>,
    ) -> Result<Vec<ProjectBriefSource>, crate::Error> {
        let conn = self.conn()?;
        let brief_id = brief_id.into();

        conn.execute(
            "DELETE FROM project_brief_sources WHERE brief_id = ?",
            vec![brief_id],
        )
        .await?;

        let mut inserted = Vec::new();
        for source in sources {
            let mut rows = conn
                .query(
                    "INSERT INTO project_brief_sources (
                        brief_id,
                        source_type,
                        source_id,
                        source_key,
                        title,
                        content_hash,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    RETURNING *",
                    vec![
                        libsql::Value::Text(source.brief_id),
                        libsql::Value::Text(source.source_type),
                        libsql::Value::Text(source.source_id),
                        libsql::Value::Text(source.source_key),
                        libsql::Value::Text(source.title),
                        libsql::Value::Text(source.content_hash),
                        libsql::Value::Text(source.created_at.to_rfc3339()),
                    ],
                )
                .await?;

            let row = rows.next().await?.unwrap();
            inserted.push(libsql::de::from_row(&row)?);
        }

        Ok(inserted)
    }

    pub async fn list_project_brief_sources(
        &self,
        brief_id: impl Into<String>,
    ) -> Result<Vec<ProjectBriefSource>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT * FROM project_brief_sources
                 WHERE brief_id = ?
                 ORDER BY source_key ASC",
                vec![brief_id.into()],
            )
            .await?;

        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(libsql::de::from_row(&row)?);
        }

        Ok(items)
    }

    pub async fn upsert_project_brief_refresh(
        &self,
        refresh: ProjectBriefRefresh,
    ) -> Result<ProjectBriefRefresh, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "INSERT INTO project_brief_refreshes (
                    id,
                    project_id,
                    brief_id,
                    status,
                    refresh_mode,
                    model_id,
                    error_message,
                    started_at,
                    completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    brief_id = excluded.brief_id,
                    status = excluded.status,
                    model_id = excluded.model_id,
                    error_message = excluded.error_message,
                    completed_at = excluded.completed_at
                RETURNING *",
                vec![
                    libsql::Value::Text(refresh.id),
                    libsql::Value::Text(refresh.project_id),
                    refresh
                        .brief_id
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Text(refresh.status.to_string()),
                    libsql::Value::Text(refresh.refresh_mode.to_string()),
                    refresh
                        .model_id
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    refresh
                        .error_message
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Text(refresh.started_at.to_rfc3339()),
                    refresh
                        .completed_at
                        .map(|value| libsql::Value::Text(value.to_rfc3339()))
                        .unwrap_or(libsql::Value::Null),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        let refresh: ProjectBriefRefresh = libsql::de::from_row(&row)?;
        Ok(refresh)
    }
}
