use super::{ProjectFile, UserDatabase};

impl UserDatabase {
    pub async fn upsert_project_file(
        &self,
        file: ProjectFile,
    ) -> Result<ProjectFile, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "INSERT INTO project_files (
                    id,
                    project_id,
                    name,
                    mime_type,
                    size_bytes,
                    storage_path,
                    status,
                    error_message,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    project_id = excluded.project_id,
                    name = excluded.name,
                    mime_type = excluded.mime_type,
                    size_bytes = excluded.size_bytes,
                    storage_path = excluded.storage_path,
                    status = excluded.status,
                    error_message = excluded.error_message,
                    updated_at = excluded.updated_at
                RETURNING *",
                vec![
                    libsql::Value::Text(file.id),
                    libsql::Value::Text(file.project_id),
                    libsql::Value::Text(file.name),
                    file.mime_type
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Integer(file.size_bytes),
                    libsql::Value::Text(file.storage_path),
                    libsql::Value::Text(file.status.to_string()),
                    file.error_message
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Text(file.created_at.to_rfc3339()),
                    libsql::Value::Text(file.updated_at.to_rfc3339()),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        let file: ProjectFile = libsql::de::from_row(&row)?;
        Ok(file)
    }

    pub async fn list_project_files(
        &self,
        project_id: impl Into<String>,
    ) -> Result<Vec<ProjectFile>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT * FROM project_files
                 WHERE project_id = ?
                 ORDER BY updated_at DESC, LOWER(name) ASC",
                vec![project_id.into()],
            )
            .await?;

        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(libsql::de::from_row(&row)?);
        }

        Ok(items)
    }

    pub async fn delete_project_file(
        &self,
        file_id: impl Into<String>,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;
        let file_id = file_id.into();

        let mut rows = conn
            .query(
                "SELECT project_id FROM project_files WHERE id = ?",
                vec![file_id.clone()],
            )
            .await?;
        let project_id: Option<String> = match rows.next().await? {
            Some(row) => row.get(0)?,
            None => None,
        };

        if let Some(project_id) = project_id {
            self.delete_project_source_knowledge(project_id, "file", file_id.clone())
                .await?;
        }

        conn.execute(
            "DELETE FROM project_file_extractions WHERE file_id = ?",
            vec![file_id.clone()],
        )
        .await?;

        conn.execute("DELETE FROM project_files WHERE id = ?", vec![file_id])
            .await?;

        Ok(())
    }
}
