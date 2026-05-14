use super::{ProjectFileExtraction, UserDatabase};

impl UserDatabase {
    pub async fn upsert_project_file_extraction(
        &self,
        extraction: ProjectFileExtraction,
    ) -> Result<ProjectFileExtraction, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "INSERT INTO project_file_extractions (
                    file_id,
                    status,
                    text_content,
                    content_hash,
                    char_count,
                    error_message,
                    extracted_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(file_id) DO UPDATE SET
                    status = excluded.status,
                    text_content = excluded.text_content,
                    content_hash = excluded.content_hash,
                    char_count = excluded.char_count,
                    error_message = excluded.error_message,
                    extracted_at = excluded.extracted_at,
                    updated_at = excluded.updated_at
                RETURNING *",
                vec![
                    libsql::Value::Text(extraction.file_id),
                    libsql::Value::Text(extraction.status.to_string()),
                    extraction
                        .text_content
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    extraction
                        .content_hash
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Integer(extraction.char_count),
                    extraction
                        .error_message
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    extraction
                        .extracted_at
                        .map(|value| libsql::Value::Text(value.to_rfc3339()))
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Text(extraction.updated_at.to_rfc3339()),
                ],
            )
            .await?;

        let row = rows.next().await?.unwrap();
        let extraction: ProjectFileExtraction = libsql::de::from_row(&row)?;
        Ok(extraction)
    }

    pub async fn list_project_file_extractions(
        &self,
        project_id: impl Into<String>,
    ) -> Result<Vec<ProjectFileExtraction>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT project_file_extractions.*
                 FROM project_file_extractions
                 INNER JOIN project_files ON project_files.id = project_file_extractions.file_id
                 WHERE project_files.project_id = ?
                 ORDER BY project_files.updated_at DESC, LOWER(project_files.name) ASC",
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
