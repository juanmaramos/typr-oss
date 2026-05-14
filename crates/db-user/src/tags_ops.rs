use super::{Tag, UserDatabase};

impl UserDatabase {
    pub async fn upsert_tag(&self, tag: Tag) -> Result<Tag, crate::Error> {
        let conn = self.conn()?;
        let tag_name = tag.name;
        let tag_id = tag.id;

        // Keep tag identity stable by reusing existing row when name already exists.
        conn.execute(
            "INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)",
            (tag_id, tag_name.clone()),
        )
        .await?;

        let mut rows = conn
            .query(
                "SELECT id, name FROM tags WHERE name = ? LIMIT 1",
                vec![tag_name.clone()],
            )
            .await?;

        let row = rows.next().await?.ok_or_else(|| {
            crate::Error::InvalidInput(format!("Tag not found after upsert: {}", tag_name))
        })?;
        let tag: Tag = libsql::de::from_row(&row).unwrap();
        Ok(tag)
    }

    pub async fn delete_tag(&self, tag_id: impl Into<String>) -> Result<(), crate::Error> {
        let conn = self.conn()?;

        conn.query("DELETE FROM tags WHERE id = ?", vec![tag_id.into()])
            .await?;
        Ok(())
    }

    pub async fn assign_tag_to_session(
        &self,
        tag_id: impl Into<String>,
        session_id: impl Into<String>,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;
        let tag_id = tag_id.into();
        let session_id = session_id.into();

        conn.execute(
            "INSERT OR IGNORE INTO tags_sessions (tag_id, session_id) VALUES (?, ?)",
            vec![tag_id, session_id],
        )
        .await?;
        Ok(())
    }

    pub async fn unassign_tag_from_session(
        &self,
        tag_id: impl Into<String>,
        session_id: impl Into<String>,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;
        let tag_id = tag_id.into();
        let session_id = session_id.into();

        conn.execute(
            "DELETE FROM tags_sessions WHERE tag_id = ? AND session_id = ?",
            vec![tag_id.clone(), session_id],
        )
        .await?;

        // Remove orphan tag rows so global tag list reflects actively used tags.
        conn.execute(
            "DELETE FROM tags
             WHERE id = ?
               AND NOT EXISTS (
                 SELECT 1
                 FROM tags_sessions
                 WHERE tag_id = ?
               )",
            vec![tag_id.clone(), tag_id],
        )
        .await?;
        Ok(())
    }

    pub async fn list_all_tags(&self) -> Result<Vec<Tag>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query("SELECT * FROM tags ORDER BY LOWER(name) ASC", ())
            .await?;

        let mut items = Vec::new();
        while let Some(row) = rows.next().await.unwrap() {
            let item: Tag = libsql::de::from_row(&row).unwrap();
            items.push(item);
        }
        Ok(items)
    }

    pub async fn list_session_tags(
        &self,
        session_id: impl Into<String>,
    ) -> Result<Vec<Tag>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT t.* FROM tags t 
                 JOIN tags_sessions ts ON t.id = ts.tag_id 
                 WHERE ts.session_id = ?
                 ORDER BY LOWER(t.name) ASC",
                vec![session_id.into()],
            )
            .await?;

        let mut items = Vec::new();
        while let Some(row) = rows.next().await.unwrap() {
            let item: Tag = libsql::de::from_row(&row).unwrap();
            items.push(item);
        }
        Ok(items)
    }
}

#[cfg(test)]
mod tests {
    use crate::{tests::setup_db, Human, Session, Tag};

    #[tokio::test]
    async fn test_tags() {
        let db = setup_db().await;

        let user = db
            .upsert_human(Human {
                full_name: Some("John Doe".to_string()),
                ..Human::default()
            })
            .await
            .unwrap();

        let _ = db
            .upsert_session(Session {
                id: uuid::Uuid::new_v4().to_string(),
                user_id: user.id.clone(),
                created_at: chrono::Utc::now(),
                visited_at: chrono::Utc::now(),
                calendar_event_id: None,
                title: "Test Session".to_string(),
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

        assert_eq!(db.list_all_tags().await.unwrap().len(), 0);

        let _ = db
            .upsert_tag(Tag {
                id: uuid::Uuid::new_v4().to_string(),
                name: "Test Tag".to_string(),
            })
            .await
            .unwrap();

        assert_eq!(db.list_all_tags().await.unwrap().len(), 1);
    }
}
