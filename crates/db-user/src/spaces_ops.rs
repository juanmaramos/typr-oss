use super::{ProjectSourceStatus, Session, Space, UserDatabase};

impl UserDatabase {
    pub async fn list_spaces(&self) -> Result<Vec<Space>, crate::Error> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, name, description, icon_type, icon_value, icon_color, created_at, updated_at
                 FROM spaces
                 ORDER BY updated_at DESC, LOWER(name) ASC",
                (),
            )
            .await?;

        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(Space::from_row(&row)?);
        }

        Ok(items)
    }

    pub async fn get_space(
        &self,
        space_id: impl Into<String>,
    ) -> Result<Option<Space>, crate::Error> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, name, description, icon_type, icon_value, icon_color, created_at, updated_at
                 FROM spaces
                 WHERE id = ?",
                vec![space_id.into()],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(Space::from_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn create_space(&self, space: Space) -> Result<Space, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "INSERT INTO spaces (
                    id,
                    name,
                    description,
                    icon_type,
                    icon_value,
                    icon_color,
                    created_at,
                    updated_at
                ) VALUES (
                    :id,
                    :name,
                    :description,
                    :icon_type,
                    :icon_value,
                    :icon_color,
                    :created_at,
                    :updated_at
                )
                RETURNING id, name, description, icon_type, icon_value, icon_color, created_at, updated_at",
                libsql::named_params! {
                    ":id": space.id.clone(),
                    ":name": space.name.clone(),
                    ":description": space.description.clone(),
                    ":icon_type": space.icon_type.clone(),
                    ":icon_value": space.icon_value.clone(),
                    ":icon_color": space.icon_color.clone(),
                    ":created_at": space.created_at.to_rfc3339(),
                    ":updated_at": space.updated_at.to_rfc3339(),
                },
            )
            .await?;

        let row = rows.next().await?.unwrap();
        Ok(Space::from_row(&row)?)
    }

    pub async fn update_space(&self, space: Space) -> Result<Space, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "UPDATE spaces
                 SET name = :name,
                     description = :description,
                     icon_type = :icon_type,
                     icon_value = :icon_value,
                     icon_color = :icon_color,
                     updated_at = :updated_at
                 WHERE id = :id
                 RETURNING id, name, description, icon_type, icon_value, icon_color, created_at, updated_at",
                libsql::named_params! {
                    ":id": space.id.clone(),
                    ":name": space.name.clone(),
                    ":description": space.description.clone(),
                    ":icon_type": space.icon_type.clone(),
                    ":icon_value": space.icon_value.clone(),
                    ":icon_color": space.icon_color.clone(),
                    ":updated_at": space.updated_at.to_rfc3339(),
                },
            )
            .await?;

        let row = rows
            .next()
            .await?
            .ok_or_else(|| crate::Error::InvalidInput(format!("Space not found: {}", space.id)))?;
        Ok(Space::from_row(&row)?)
    }

    pub async fn delete_space(&self, space_id: impl Into<String>) -> Result<(), crate::Error> {
        let space_id = space_id.into();
        let conn = self.conn()?;
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "DELETE FROM project_source_chunks WHERE project_id = ?",
            vec![space_id.clone()],
        )
        .await?;

        conn.execute(
            "DELETE FROM project_source_digests WHERE project_id = ?",
            vec![space_id.clone()],
        )
        .await?;

        conn.execute(
            "UPDATE sessions SET space_id = NULL WHERE space_id = ?",
            vec![space_id.clone()],
        )
        .await?;

        conn.execute(
            "UPDATE ask_threads
             SET archived_at = COALESCE(archived_at, ?),
                 updated_at = ?
             WHERE scope_type = ? AND scope_id = ?",
            vec![now.clone(), now, "Project".to_string(), space_id.clone()],
        )
        .await?;

        conn.execute("DELETE FROM spaces WHERE id = ?", vec![space_id])
            .await?;

        Ok(())
    }

    pub async fn assign_session_to_space(
        &self,
        session_id: impl Into<String>,
        space_id: impl Into<String>,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;
        let session_id = session_id.into();
        let space_id = space_id.into();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE sessions
             SET space_id = ?,
                 visited_at = ?
             WHERE id = ?",
            vec![space_id.clone(), now.clone(), session_id.clone()],
        )
        .await?;

        let mut removed_rows = conn
            .query(
                "SELECT project_id FROM project_sources
                 WHERE session_id = ? AND project_id != ?",
                vec![session_id.clone(), space_id.clone()],
            )
            .await?;
        let mut removed_project_ids = Vec::new();
        while let Some(row) = removed_rows.next().await? {
            removed_project_ids.push(row.get::<String>(0)?);
        }

        conn.execute(
            "DELETE FROM project_sources
             WHERE session_id = ? AND project_id != ?",
            vec![session_id.clone(), space_id.clone()],
        )
        .await?;

        for project_id in removed_project_ids {
            self.delete_project_source_knowledge(project_id, "note", session_id.clone())
                .await?;
        }

        self.create_included_project_source(space_id.clone(), session_id)
            .await?;

        conn.execute(
            "UPDATE spaces
             SET updated_at = ?
             WHERE id = ?",
            vec![now, space_id],
        )
        .await?;

        Ok(())
    }

    pub async fn add_session_to_project(
        &self,
        project_id: impl Into<String>,
        session_id: impl Into<String>,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;
        let project_id = project_id.into();
        let session_id = session_id.into();
        let now = chrono::Utc::now().to_rfc3339();

        self.create_included_project_source(project_id.clone(), session_id.clone())
            .await?;

        conn.execute(
            "UPDATE sessions
             SET space_id = COALESCE(space_id, ?)
             WHERE id = ?",
            vec![project_id.clone(), session_id],
        )
        .await?;

        conn.execute(
            "UPDATE spaces
             SET updated_at = ?
             WHERE id = ?",
            vec![now, project_id],
        )
        .await?;

        Ok(())
    }

    pub async fn remove_session_from_project(
        &self,
        project_id: impl Into<String>,
        session_id: impl Into<String>,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;
        let project_id = project_id.into();
        let session_id = session_id.into();
        let now = chrono::Utc::now().to_rfc3339();

        self.delete_project_source(project_id.clone(), session_id.clone())
            .await?;
        self.delete_project_source_knowledge(project_id.clone(), "note", session_id.clone())
            .await?;

        let mut rows = conn
            .query(
                "SELECT space_id FROM sessions WHERE id = ?",
                vec![session_id.clone()],
            )
            .await?;

        let current_space_id: Option<String> = match rows.next().await? {
            Some(row) => row.get(0)?,
            None => None,
        };

        if current_space_id.as_deref() == Some(project_id.as_str()) {
            let mut replacement_rows = conn
                .query(
                    "SELECT project_id FROM project_sources
                     WHERE session_id = ?
                     ORDER BY updated_at DESC
                     LIMIT 1",
                    vec![session_id.clone()],
                )
                .await?;

            let replacement_project_id: Option<String> = match replacement_rows.next().await? {
                Some(row) => row.get(0)?,
                None => None,
            };

            conn.execute(
                "UPDATE sessions
                 SET space_id = ?
                 WHERE id = ?",
                vec![
                    replacement_project_id
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                    libsql::Value::Text(session_id.clone()),
                ],
            )
            .await?;
        }

        conn.execute(
            "UPDATE spaces
             SET updated_at = ?
             WHERE id = ?",
            vec![now, project_id],
        )
        .await?;

        Ok(())
    }

    pub async fn clear_session_space(
        &self,
        session_id: impl Into<String>,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;
        let session_id = session_id.into();
        let now = chrono::Utc::now().to_rfc3339();

        let mut rows = conn
            .query(
                "SELECT space_id FROM sessions WHERE id = ?",
                vec![session_id.clone()],
            )
            .await?;

        let previous_space_id: Option<String> = match rows.next().await? {
            Some(row) => row.get(0)?,
            None => None,
        };

        conn.execute(
            "UPDATE sessions
             SET space_id = NULL,
                 visited_at = ?
             WHERE id = ?",
            vec![now.clone(), session_id.clone()],
        )
        .await?;

        if let Some(space_id) = previous_space_id {
            self.delete_project_source(space_id.clone(), session_id.clone())
                .await?;
            self.delete_project_source_knowledge(space_id.clone(), "note", session_id.clone())
                .await?;

            conn.execute(
                "UPDATE spaces
                 SET updated_at = ?
                 WHERE id = ?",
                vec![now, space_id],
            )
            .await?;
        }

        Ok(())
    }

    pub async fn list_sessions_by_space(
        &self,
        space_id: impl Into<String>,
        limit: Option<u8>,
        search: Option<String>,
    ) -> Result<Vec<Session>, crate::Error> {
        let conn = self.conn()?;
        let space_id = space_id.into();
        let limit = limit.unwrap_or(100).to_string();
        let select_columns = "SELECT sessions.id, sessions.created_at, sessions.visited_at, sessions.user_id, sessions.calendar_event_id, sessions.title, sessions.raw_memo_html, sessions.enhanced_memo_html, sessions.conversations, sessions.words, sessions.record_start, sessions.record_end, sessions.pre_meeting_memo_html, sessions.source_type, sessions.source_metadata, sessions.space_id, sessions.auto_enhanced_memo_html, sessions.needs_enhance FROM sessions INNER JOIN project_sources ON project_sources.session_id = sessions.id";

        let mut rows = if let Some(search) = search {
            let search = format!("%{}%", search);
            conn.query(
                &format!(
                    "{} WHERE project_sources.project_id = ? AND (
                        sessions.title LIKE ? OR
                        REPLACE(REPLACE(REPLACE(raw_memo_html, '<', ' '), '>', ' '), '&nbsp;', ' ') LIKE ? OR
                        REPLACE(REPLACE(REPLACE(enhanced_memo_html, '<', ' '), '>', ' '), '&nbsp;', ' ') LIKE ?
                    )
                    ORDER BY sessions.visited_at DESC
                    LIMIT ?",
                    select_columns
                ),
                vec![space_id, search.clone(), search.clone(), search, limit],
            )
            .await?
        } else {
            conn.query(
                &format!(
                    "{} WHERE project_sources.project_id = ? ORDER BY sessions.visited_at DESC LIMIT ?",
                    select_columns
                ),
                vec![space_id, limit],
            )
            .await?
        };

        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(Session::from_row(&row)?);
        }

        Ok(items)
    }

    pub async fn list_included_sessions_by_space(
        &self,
        space_id: impl Into<String>,
        limit: Option<u8>,
        search: Option<String>,
    ) -> Result<Vec<Session>, crate::Error> {
        let conn = self.conn()?;
        let space_id = space_id.into();
        let limit = limit.unwrap_or(100).to_string();
        let select_columns = "SELECT sessions.id, sessions.created_at, sessions.visited_at, sessions.user_id, sessions.calendar_event_id, sessions.title, sessions.raw_memo_html, sessions.enhanced_memo_html, sessions.conversations, sessions.words, sessions.record_start, sessions.record_end, sessions.pre_meeting_memo_html, sessions.source_type, sessions.source_metadata, sessions.space_id, sessions.auto_enhanced_memo_html, sessions.needs_enhance FROM sessions INNER JOIN project_sources ON project_sources.session_id = sessions.id";

        let mut rows = if let Some(search) = search {
            let search = format!("%{}%", search);
            conn.query(
                &format!(
                    "{} WHERE project_sources.project_id = ? AND project_sources.status = ? AND (
                        sessions.title LIKE ? OR
                        REPLACE(REPLACE(REPLACE(sessions.raw_memo_html, '<', ' '), '>', ' '), '&nbsp;', ' ') LIKE ? OR
                        REPLACE(REPLACE(REPLACE(sessions.enhanced_memo_html, '<', ' '), '>', ' '), '&nbsp;', ' ') LIKE ?
                    )
                    ORDER BY sessions.visited_at DESC
                    LIMIT ?",
                    select_columns
                ),
                vec![
                    space_id,
                    ProjectSourceStatus::Included.to_string(),
                    search.clone(),
                    search.clone(),
                    search,
                    limit,
                ],
            )
            .await?
        } else {
            conn.query(
                &format!(
                    "{} WHERE project_sources.project_id = ? AND project_sources.status = ? ORDER BY sessions.visited_at DESC LIMIT ?",
                    select_columns
                ),
                vec![space_id, ProjectSourceStatus::Included.to_string(), limit],
            )
            .await?
        };

        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(Session::from_row(&row)?);
        }

        Ok(items)
    }

    pub async fn list_projects_by_session(
        &self,
        session_id: impl Into<String>,
    ) -> Result<Vec<Space>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT spaces.id, spaces.name, spaces.description, spaces.icon_type, spaces.icon_value, spaces.icon_color, spaces.created_at, spaces.updated_at
                 FROM spaces
                 INNER JOIN project_sources ON project_sources.project_id = spaces.id
                 WHERE project_sources.session_id = ?
                 ORDER BY project_sources.updated_at DESC",
                vec![session_id.into()],
            )
            .await?;

        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(Space::from_row(&row)?);
        }

        Ok(items)
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        tests::setup_db, AskScopeType, AskThread, Human, ProjectSourceChunk, ProjectSourceDigest,
        ProjectSourceDigestSourceKind, ProjectSourceStatus, Session, Space,
    };

    #[tokio::test]
    async fn test_spaces_lifecycle() {
        let db = setup_db().await;
        let user = db
            .upsert_human(Human {
                full_name: Some("Space Owner".to_string()),
                ..Human::default()
            })
            .await
            .unwrap();

        let space = db
            .create_space(Space {
                id: uuid::Uuid::new_v4().to_string(),
                name: "WFI".to_string(),
                description: Some("Europa rollout".to_string()),
                icon_type: "remix".to_string(),
                icon_value: "ri-folder-3-line".to_string(),
                icon_color: "neutral".to_string(),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            })
            .await
            .unwrap();

        let session = db
            .upsert_session(Session {
                id: uuid::Uuid::new_v4().to_string(),
                user_id: user.id.clone(),
                created_at: chrono::Utc::now(),
                visited_at: chrono::Utc::now(),
                calendar_event_id: None,
                title: "Rollout planning".to_string(),
                raw_memo_html: "".to_string(),
                enhanced_memo_html: None,
                auto_enhanced_memo_html: None,
                conversations: vec![],
                words: vec![],
                record_start: None,
                record_end: None,
                pre_meeting_memo_html: None,
                source_type: Some("manual".to_string()),
                source_metadata: None,
                space_id: None,
                needs_enhance: false,
            })
            .await
            .unwrap();

        db.assign_session_to_space(session.id.clone(), space.id.clone())
            .await
            .unwrap();

        let sessions = db
            .list_sessions_by_space(space.id.clone(), None, None)
            .await
            .unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].space_id, Some(space.id.clone()));

        db.clear_session_space(session.id.clone()).await.unwrap();
        let sessions = db
            .list_sessions_by_space(space.id.clone(), None, None)
            .await
            .unwrap();
        assert!(sessions.is_empty());

        db.delete_space(space.id.clone()).await.unwrap();
        assert!(db.get_space(space.id).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_delete_space_archives_project_ask_threads() {
        let db = setup_db().await;
        let user = db
            .upsert_human(Human {
                full_name: Some("Ask Owner".to_string()),
                ..Human::default()
            })
            .await
            .unwrap();
        let project = db
            .create_space(Space {
                id: uuid::Uuid::new_v4().to_string(),
                name: "Project with Ask".to_string(),
                description: None,
                icon_type: "remix".to_string(),
                icon_value: "ri-folder-3-line".to_string(),
                icon_color: "neutral".to_string(),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            })
            .await
            .unwrap();
        let now = chrono::Utc::now();
        let thread = db
            .create_ask_thread(AskThread {
                id: uuid::Uuid::new_v4().to_string(),
                user_id: user.id.clone(),
                scope_type: AskScopeType::Project,
                scope_id: Some(project.id.clone()),
                title: Some("Can I ask this project?".to_string()),
                created_at: now,
                updated_at: now,
                last_message_at: None,
                archived_at: None,
            })
            .await
            .unwrap();

        db.delete_space(project.id).await.unwrap();

        assert!(db
            .list_ask_threads(
                user.id,
                Some(AskScopeType::Project),
                thread.scope_id.clone()
            )
            .await
            .unwrap()
            .is_empty());
        assert!(db
            .get_ask_thread(thread.id)
            .await
            .unwrap()
            .unwrap()
            .archived_at
            .is_some());
    }

    #[tokio::test]
    async fn test_project_sources_allow_session_in_multiple_projects() {
        let db = setup_db().await;
        let user = db
            .upsert_human(Human {
                full_name: Some("Project Owner".to_string()),
                ..Human::default()
            })
            .await
            .unwrap();

        let project_a = db
            .create_space(Space {
                id: uuid::Uuid::new_v4().to_string(),
                name: "Project A".to_string(),
                description: None,
                icon_type: "remix".to_string(),
                icon_value: "ri-folder-3-line".to_string(),
                icon_color: "neutral".to_string(),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            })
            .await
            .unwrap();
        let project_b = db
            .create_space(Space {
                id: uuid::Uuid::new_v4().to_string(),
                name: "Project B".to_string(),
                description: None,
                icon_type: "remix".to_string(),
                icon_value: "ri-folder-3-line".to_string(),
                icon_color: "blue".to_string(),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            })
            .await
            .unwrap();

        let session = db
            .upsert_session(Session {
                id: uuid::Uuid::new_v4().to_string(),
                user_id: user.id.clone(),
                created_at: chrono::Utc::now(),
                visited_at: chrono::Utc::now(),
                calendar_event_id: None,
                title: "Shared planning".to_string(),
                raw_memo_html: "".to_string(),
                enhanced_memo_html: None,
                auto_enhanced_memo_html: None,
                conversations: vec![],
                words: vec![],
                record_start: None,
                record_end: None,
                pre_meeting_memo_html: None,
                source_type: Some("manual".to_string()),
                source_metadata: None,
                space_id: None,
                needs_enhance: false,
            })
            .await
            .unwrap();

        db.add_session_to_project(project_a.id.clone(), session.id.clone())
            .await
            .unwrap();
        db.add_session_to_project(project_b.id.clone(), session.id.clone())
            .await
            .unwrap();
        upsert_test_source_knowledge(&db, &project_a.id, "note", &session.id).await;
        upsert_test_source_knowledge(&db, &project_b.id, "note", &session.id).await;

        assert_eq!(
            db.list_sessions_by_space(project_a.id.clone(), None, None)
                .await
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            db.list_sessions_by_space(project_b.id.clone(), None, None)
                .await
                .unwrap()
                .len(),
            1
        );

        let projects = db
            .list_projects_by_session(session.id.clone())
            .await
            .unwrap();
        assert_eq!(projects.len(), 2);

        db.set_project_source_status(
            project_a.id.clone(),
            session.id.clone(),
            ProjectSourceStatus::ExcludedFromBrief,
        )
        .await
        .unwrap();

        assert!(db
            .list_included_sessions_by_space(project_a.id.clone(), None, None)
            .await
            .unwrap()
            .is_empty());
        assert_eq!(
            db.list_included_sessions_by_space(project_b.id.clone(), None, None)
                .await
                .unwrap()
                .len(),
            1
        );

        db.remove_session_from_project(project_a.id.clone(), session.id.clone())
            .await
            .unwrap();

        assert!(db
            .list_project_source_chunks(project_a.id.clone())
            .await
            .unwrap()
            .is_empty());
        assert!(db
            .list_project_source_digests(project_a.id.clone())
            .await
            .unwrap()
            .is_empty());
        assert_eq!(
            db.list_project_source_chunks(project_b.id.clone())
                .await
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            db.list_project_source_digests(project_b.id.clone())
                .await
                .unwrap()
                .len(),
            1
        );

        assert!(db
            .list_sessions_by_space(project_a.id.clone(), None, None)
            .await
            .unwrap()
            .is_empty());
        assert_eq!(
            db.list_sessions_by_space(project_b.id.clone(), None, None)
                .await
                .unwrap()
                .len(),
            1
        );

        db.assign_session_to_space(session.id.clone(), project_a.id.clone())
            .await
            .unwrap();

        assert_eq!(
            db.list_sessions_by_space(project_a.id.clone(), None, None)
                .await
                .unwrap()
                .len(),
            1
        );
        assert!(db
            .list_sessions_by_space(project_b.id.clone(), None, None)
            .await
            .unwrap()
            .is_empty());
        assert!(db
            .list_project_source_chunks(project_b.id.clone())
            .await
            .unwrap()
            .is_empty());
        assert!(db
            .list_project_source_digests(project_b.id.clone())
            .await
            .unwrap()
            .is_empty());
    }

    async fn upsert_test_source_knowledge(
        db: &crate::UserDatabase,
        project_id: &str,
        source_type: &str,
        source_id: &str,
    ) {
        let now = chrono::Utc::now();
        db.replace_project_source_chunks(
            project_id.to_string(),
            source_type.to_string(),
            source_id.to_string(),
            vec![ProjectSourceChunk {
                id: format!("{project_id}:{source_type}:{source_id}:0"),
                project_id: project_id.to_string(),
                source_type: source_type.to_string(),
                source_id: source_id.to_string(),
                chunk_index: 0,
                source_locator: Some("Chunk 1".to_string()),
                title: "Source".to_string(),
                text_content: "Readable source text".to_string(),
                content_hash: "chunk-hash".to_string(),
                char_count: 20,
                source_hash: "source-hash".to_string(),
                created_at: now,
                updated_at: now,
            }],
        )
        .await
        .unwrap();

        db.upsert_project_source_digest(ProjectSourceDigest {
            project_id: project_id.to_string(),
            source_type: source_type.to_string(),
            source_id: source_id.to_string(),
            title: "Source".to_string(),
            digest_source_kind: ProjectSourceDigestSourceKind::GeneratedFromChunks,
            source_hash: "source-hash".to_string(),
            summary: "Summary".to_string(),
            claims_json: "[]".to_string(),
            entities_json: "[]".to_string(),
            open_questions_json: "[]".to_string(),
            decisions_json: "[]".to_string(),
            risks_json: "[]".to_string(),
            contradictions_json: "[]".to_string(),
            digest_markdown: "Summary: Summary".to_string(),
            created_at: now,
            updated_at: now,
        })
        .await
        .unwrap();
    }
}
