use super::{ProjectKnowledgeJob, ProjectKnowledgeJobStatus, UserDatabase};

impl UserDatabase {
    pub async fn enqueue_project_knowledge_job(
        &self,
        job: ProjectKnowledgeJob,
    ) -> Result<ProjectKnowledgeJob, crate::Error> {
        let conn = self.conn()?;

        if let Some(existing) = self
            .get_active_project_knowledge_job(&job.dedupe_key)
            .await?
        {
            return Ok(existing);
        }

        let mut rows = conn
            .query(
                "INSERT INTO project_knowledge_jobs (
                    id,
                    project_id,
                    job_type,
                    status,
                    dedupe_key,
                    source_type,
                    source_id,
                    model_id,
                    attempt_count,
                    error_message,
                    run_after,
                    queued_at,
                    started_at,
                    completed_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING *",
                vec![
                    libsql::Value::Text(job.id),
                    libsql::Value::Text(job.project_id),
                    libsql::Value::Text(job.job_type.to_string()),
                    libsql::Value::Text(job.status.to_string()),
                    libsql::Value::Text(job.dedupe_key),
                    job.source_type
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    job.source_id
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    job.model_id
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Integer(job.attempt_count),
                    job.error_message
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Text(job.run_after.to_rfc3339()),
                    libsql::Value::Text(job.queued_at.to_rfc3339()),
                    job.started_at
                        .map(|value| libsql::Value::Text(value.to_rfc3339()))
                        .unwrap_or(libsql::Value::Null),
                    job.completed_at
                        .map(|value| libsql::Value::Text(value.to_rfc3339()))
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Text(job.updated_at.to_rfc3339()),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        Ok(libsql::de::from_row(&row)?)
    }

    pub async fn list_project_knowledge_jobs(
        &self,
        project_id: impl Into<String>,
    ) -> Result<Vec<ProjectKnowledgeJob>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT * FROM project_knowledge_jobs
                 WHERE project_id = ?
                 ORDER BY queued_at DESC",
                vec![project_id.into()],
            )
            .await?;

        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(libsql::de::from_row(&row)?);
        }

        Ok(items)
    }

    pub async fn claim_next_project_knowledge_job(
        &self,
    ) -> Result<Option<ProjectKnowledgeJob>, crate::Error> {
        let conn = self.conn()?;
        let now = chrono::Utc::now();

        let mut rows = conn
            .query(
                "SELECT * FROM project_knowledge_jobs
                 WHERE status = ? AND run_after <= ?
                 ORDER BY run_after ASC, queued_at ASC
                 LIMIT 1",
                vec![
                    libsql::Value::Text(ProjectKnowledgeJobStatus::Queued.to_string()),
                    libsql::Value::Text(now.to_rfc3339()),
                ],
            )
            .await?;

        let Some(row) = rows.next().await? else {
            return Ok(None);
        };
        let job: ProjectKnowledgeJob = libsql::de::from_row(&row)?;

        let mut updated_rows = conn
            .query(
                "UPDATE project_knowledge_jobs
                 SET status = ?,
                     attempt_count = attempt_count + 1,
                     error_message = NULL,
                     started_at = ?,
                     updated_at = ?
                 WHERE id = ? AND status = ?
                 RETURNING *",
                vec![
                    libsql::Value::Text(ProjectKnowledgeJobStatus::Running.to_string()),
                    libsql::Value::Text(now.to_rfc3339()),
                    libsql::Value::Text(now.to_rfc3339()),
                    libsql::Value::Text(job.id),
                    libsql::Value::Text(ProjectKnowledgeJobStatus::Queued.to_string()),
                ],
            )
            .await?;

        match updated_rows.next().await? {
            Some(row) => Ok(Some(libsql::de::from_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn complete_project_knowledge_job(
        &self,
        id: impl Into<String>,
    ) -> Result<ProjectKnowledgeJob, crate::Error> {
        let conn = self.conn()?;
        let now = chrono::Utc::now();

        let mut rows = conn
            .query(
                "UPDATE project_knowledge_jobs
                 SET status = ?,
                     completed_at = ?,
                     updated_at = ?
                 WHERE id = ?
                 RETURNING *",
                vec![
                    libsql::Value::Text(ProjectKnowledgeJobStatus::Complete.to_string()),
                    libsql::Value::Text(now.to_rfc3339()),
                    libsql::Value::Text(now.to_rfc3339()),
                    libsql::Value::Text(id.into()),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        Ok(libsql::de::from_row(&row)?)
    }

    pub async fn retry_project_knowledge_job(
        &self,
        id: impl Into<String>,
        error_message: impl Into<String>,
        run_after: impl Into<String>,
    ) -> Result<ProjectKnowledgeJob, crate::Error> {
        let conn = self.conn()?;
        let now = chrono::Utc::now();
        let run_after = normalize_project_knowledge_job_timestamp(run_after)?;

        let mut rows = conn
            .query(
                "UPDATE project_knowledge_jobs
                 SET status = ?,
                     error_message = ?,
                     run_after = ?,
                     updated_at = ?
                 WHERE id = ?
                 RETURNING *",
                vec![
                    libsql::Value::Text(ProjectKnowledgeJobStatus::Queued.to_string()),
                    libsql::Value::Text(error_message.into()),
                    libsql::Value::Text(run_after),
                    libsql::Value::Text(now.to_rfc3339()),
                    libsql::Value::Text(id.into()),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        Ok(libsql::de::from_row(&row)?)
    }

    pub async fn release_project_knowledge_job(
        &self,
        id: impl Into<String>,
        run_after: impl Into<String>,
    ) -> Result<ProjectKnowledgeJob, crate::Error> {
        let conn = self.conn()?;
        let now = chrono::Utc::now();
        let run_after = normalize_project_knowledge_job_timestamp(run_after)?;

        let mut rows = conn
            .query(
                "UPDATE project_knowledge_jobs
                 SET status = ?,
                     attempt_count = CASE WHEN attempt_count > 0 THEN attempt_count - 1 ELSE 0 END,
                     run_after = ?,
                     started_at = NULL,
                     updated_at = ?
                 WHERE id = ?
                 RETURNING *",
                vec![
                    libsql::Value::Text(ProjectKnowledgeJobStatus::Queued.to_string()),
                    libsql::Value::Text(run_after),
                    libsql::Value::Text(now.to_rfc3339()),
                    libsql::Value::Text(id.into()),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        Ok(libsql::de::from_row(&row)?)
    }

    pub async fn fail_project_knowledge_job(
        &self,
        id: impl Into<String>,
        error_message: impl Into<String>,
    ) -> Result<ProjectKnowledgeJob, crate::Error> {
        let conn = self.conn()?;
        let now = chrono::Utc::now();

        let mut rows = conn
            .query(
                "UPDATE project_knowledge_jobs
                 SET status = ?,
                     error_message = ?,
                     completed_at = ?,
                     updated_at = ?
                 WHERE id = ?
                 RETURNING *",
                vec![
                    libsql::Value::Text(ProjectKnowledgeJobStatus::Failed.to_string()),
                    libsql::Value::Text(error_message.into()),
                    libsql::Value::Text(now.to_rfc3339()),
                    libsql::Value::Text(now.to_rfc3339()),
                    libsql::Value::Text(id.into()),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        Ok(libsql::de::from_row(&row)?)
    }

    pub async fn reclaim_stale_project_knowledge_jobs(
        &self,
        stale_before: impl Into<String>,
        max_attempts: i64,
    ) -> Result<Vec<ProjectKnowledgeJob>, crate::Error> {
        let conn = self.conn()?;
        let now = chrono::Utc::now().to_rfc3339();
        let stale_before = stale_before.into();

        let mut rows = conn
            .query(
                "UPDATE project_knowledge_jobs
                 SET status = CASE WHEN attempt_count >= ? THEN ? ELSE ? END,
                     error_message = CASE
                         WHEN attempt_count >= ? THEN 'Job was abandoned while running.'
                         ELSE 'Job was reclaimed after app restart.'
                     END,
                     run_after = CASE WHEN attempt_count >= ? THEN run_after ELSE ? END,
                     completed_at = CASE WHEN attempt_count >= ? THEN ? ELSE NULL END,
                     started_at = NULL,
                     updated_at = ?
                 WHERE status = ? AND updated_at < ?
                 RETURNING *",
                vec![
                    libsql::Value::Integer(max_attempts),
                    libsql::Value::Text(ProjectKnowledgeJobStatus::Failed.to_string()),
                    libsql::Value::Text(ProjectKnowledgeJobStatus::Queued.to_string()),
                    libsql::Value::Integer(max_attempts),
                    libsql::Value::Integer(max_attempts),
                    libsql::Value::Text(now.clone()),
                    libsql::Value::Integer(max_attempts),
                    libsql::Value::Text(now.clone()),
                    libsql::Value::Text(now),
                    libsql::Value::Text(ProjectKnowledgeJobStatus::Running.to_string()),
                    libsql::Value::Text(stale_before),
                ],
            )
            .await?;

        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(libsql::de::from_row(&row)?);
        }

        Ok(items)
    }

    async fn get_active_project_knowledge_job(
        &self,
        dedupe_key: &str,
    ) -> Result<Option<ProjectKnowledgeJob>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT * FROM project_knowledge_jobs
                 WHERE dedupe_key = ? AND status IN (?, ?)
                 ORDER BY queued_at ASC
                 LIMIT 1",
                vec![
                    libsql::Value::Text(dedupe_key.to_string()),
                    libsql::Value::Text(ProjectKnowledgeJobStatus::Queued.to_string()),
                    libsql::Value::Text(ProjectKnowledgeJobStatus::Running.to_string()),
                ],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(libsql::de::from_row(&row)?)),
            None => Ok(None),
        }
    }
}

fn normalize_project_knowledge_job_timestamp(
    value: impl Into<String>,
) -> Result<String, crate::Error> {
    let value = value.into();
    chrono::DateTime::parse_from_rfc3339(&value)
        .map(|date| date.with_timezone(&chrono::Utc).to_rfc3339())
        .map_err(|error| crate::Error::ChronoParseError(error.to_string()))
}
