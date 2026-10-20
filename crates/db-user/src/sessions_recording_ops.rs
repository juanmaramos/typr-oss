use crate::{GetSessionFilter, Session, UserDatabase};

impl UserDatabase {
    pub async fn mark_recording_started(&self, session_id: &str) -> Result<(), crate::Error> {
        self.conn()?.execute(
            "UPDATE sessions SET record_start = COALESCE(record_start, ?), record_end = NULL, needs_enhance = 0 WHERE id = ?",
            (chrono::Utc::now().to_rfc3339(), session_id),
        ).await?;
        Ok(())
    }

    pub async fn begin_recording(
        &self,
        session_id: &str,
        template_id: Option<String>,
    ) -> Result<(), crate::Error> {
        self.conn()?.execute(
            "UPDATE sessions SET record_end = NULL, needs_enhance = 0, source_metadata = json_set(CASE WHEN json_valid(source_metadata) AND json_type(source_metadata) = 'object' THEN source_metadata ELSE '{}' END, '$.summary_template_id', json(?)) WHERE id = ?",
            (serde_json::to_string(&template_id)?, session_id),
        ).await?;
        Ok(())
    }

    pub async fn append_session_words(
        &self,
        session_id: &str,
        words: Vec<typr_listener_interface::Word>,
    ) -> Result<Vec<typr_listener_interface::Word>, crate::Error> {
        let mut rows = self.conn()?.query(
            "UPDATE sessions SET words = (SELECT json_group_array(json(value)) FROM (SELECT value, 0 AS source, key AS position FROM json_each(sessions.words) UNION ALL SELECT value, 1 AS source, key AS position FROM json_each(?) ORDER BY source, position)) WHERE id = ? RETURNING words",
            (serde_json::to_string(&words)?, session_id),
        ).await?;
        match rows.next().await? {
            Some(row) => Ok(serde_json::from_str(row.get_str(0)?)?),
            None => Err(crate::Error::InvalidInput("session not found".to_owned())),
        }
    }

    pub async fn update_session_note_fields(
        &self,
        session_id: &str,
        updates: Vec<crate::SessionNoteUpdate>,
    ) -> Result<Option<Session>, crate::Error> {
        if !updates.is_empty() {
            let mut assignments = Vec::with_capacity(updates.len());
            let mut values = Vec::<libsql::Value>::with_capacity(updates.len() + 1);
            for update in updates {
                use crate::SessionNoteUpdate::*;
                let (column, value) = match update {
                    Title(value) => ("title", Some(value)),
                    RawMemoHtml(value) => ("raw_memo_html", Some(value)),
                    EnhancedMemoHtml(value) => ("enhanced_memo_html", value),
                    AutoEnhancedMemoHtml(value) => ("auto_enhanced_memo_html", value),
                    PreMeetingMemoHtml(value) => ("pre_meeting_memo_html", value),
                };
                assignments.push(format!("{column} = ?"));
                values.push(
                    value
                        .map(libsql::Value::Text)
                        .unwrap_or(libsql::Value::Null),
                );
            }
            values.push(libsql::Value::Text(session_id.to_owned()));
            self.conn()?
                .execute(
                    &format!(
                        "UPDATE sessions SET {} WHERE id = ?",
                        assignments.join(", ")
                    ),
                    values,
                )
                .await?;
        }
        self.get_session(GetSessionFilter::Id(session_id.to_owned()))
            .await
    }

    pub async fn save_recording_title(
        &self,
        session_id: &str,
        record_end: chrono::DateTime<chrono::Utc>,
        previous_title: &str,
        title: &str,
    ) -> Result<bool, crate::Error> {
        let changed = self
            .conn()?
            .execute(
                "UPDATE sessions SET title = ? WHERE id = ? AND record_end = ? AND title = ?",
                (title, session_id, record_end.to_rfc3339(), previous_title),
            )
            .await?;
        Ok(changed > 0)
    }

    /// Publish completion only after the listener has drained its final transcript writes.
    pub async fn complete_recording(
        &self,
        session_id: &str,
        transcript_finalized: bool,
    ) -> Result<(), crate::Error> {
        self.conn()?.execute(
            "UPDATE sessions SET record_end = ?, needs_enhance = (? AND json_array_length(words) >= 5) WHERE id = ? AND record_start IS NOT NULL AND record_end IS NULL",
            (chrono::Utc::now().to_rfc3339(), transcript_finalized, session_id),
        ).await?;
        Ok(())
    }

    pub async fn set_summary_template(
        &self,
        session_id: &str,
        template_id: Option<String>,
    ) -> Result<(), crate::Error> {
        self.conn()?.execute(
            "UPDATE sessions SET source_metadata = json_set(CASE WHEN json_valid(source_metadata) AND json_type(source_metadata) = 'object' THEN source_metadata ELSE '{}' END, '$.summary_template_id', json(?)) WHERE id = ?",
            (serde_json::to_string(&template_id).unwrap(), session_id),
        ).await?;
        Ok(())
    }

    /// Update only generated fields, and discard results for a superseded transcript/run.
    pub async fn save_recording_summary(
        &self,
        session_id: &str,
        words: &str,
        record_end: chrono::DateTime<chrono::Utc>,
        previous_html: Option<&str>,
        html: &str,
    ) -> Result<bool, crate::Error> {
        let changed = self.conn()?.execute(
            "UPDATE sessions SET auto_enhanced_memo_html = ?, enhanced_memo_html = CASE WHEN enhanced_memo_html IS ? THEN ? ELSE enhanced_memo_html END, needs_enhance = 0 WHERE id = ? AND words = ? AND record_end = ? AND needs_enhance = 1",
            libsql::params![html, previous_html, html, session_id, words, record_end.to_rfc3339()],
        ).await?;
        Ok(changed > 0)
    }

}

#[cfg(test)]
mod tests {
    use crate::{tests::setup_db, Human, Session};

    async fn recording(db: &crate::UserDatabase) -> Session {
        let user = db.upsert_human(Human::default()).await.unwrap();
        let mut session: Session = serde_json::from_value(serde_json::json!({
            "id": uuid::Uuid::new_v4().to_string(), "user_id": user.id,
            "created_at": chrono::Utc::now(), "visited_at": chrono::Utc::now(),
            "calendar_event_id": null, "title": "Original title", "raw_memo_html": "Raw notes",
            "enhanced_memo_html": null, "auto_enhanced_memo_html": null,
            "words": [], "record_start": chrono::Utc::now(), "record_end": null,
            "pre_meeting_memo_html": null, "source_type": "manual", "source_metadata": null,
            "space_id": null, "needs_enhance": false
        }))
        .unwrap();
        session.words = (0..5)
            .map(|i| typr_listener_interface::Word {
                text: format!("word {i}"),
                start_ms: None,
                end_ms: None,
                speaker: None,
                confidence: None,
            })
            .collect();
        db.upsert_session(session).await.unwrap()
    }

    #[tokio::test]
    async fn completion_queues_final_transcript_once_and_skips_unstarted_recordings() {
        let db = setup_db().await;
        let mut session = recording(&db).await;
        session.record_start = None;
        db.upsert_session(session.clone()).await.unwrap();
        db.complete_recording(&session.id, true).await.unwrap();
        assert!(db
            .get_session(crate::GetSessionFilter::Id(session.id.clone()))
            .await
            .unwrap()
            .unwrap()
            .record_end
            .is_none());
        session.record_start = Some(chrono::Utc::now());
        // Simulate the last transcript chunk arriving before native completion.
        session.words.push(session.words[0].clone());
        db.upsert_session(session.clone()).await.unwrap();
        db.complete_recording(&session.id, true).await.unwrap();
        let completed = db
            .get_session(crate::GetSessionFilter::Id(session.id.clone()))
            .await
            .unwrap()
            .unwrap();
        assert!(completed.needs_enhance);
        assert_eq!(completed.words.len(), 6);
        db.complete_recording(&session.id, true).await.unwrap();
        let repeated = db
            .get_session(crate::GetSessionFilter::Id(session.id))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(repeated.record_end, completed.record_end);
    }

    #[tokio::test]
    async fn recording_summary_preserves_edits_and_rejects_duplicate_and_superseded_results() {
        let db = setup_db().await;
        let mut session = recording(&db).await;
        db.complete_recording(&session.id, true).await.unwrap();
        session = db
            .get_session(crate::GetSessionFilter::Id(session.id.clone()))
            .await
            .unwrap()
            .unwrap();
        let words = serde_json::to_string(&session.words).unwrap();
        let ended = session.record_end.unwrap();
        session.title = "Renamed while generating".into();
        session.raw_memo_html = "Edited raw notes".into();
        session.enhanced_memo_html = Some("User edited summary".into());
        db.upsert_session(session.clone()).await.unwrap();
        assert!(db
            .save_recording_summary(&session.id, &words, ended, None, "Generated summary")
            .await
            .unwrap());
        let saved = db
            .get_session(crate::GetSessionFilter::Id(session.id.clone()))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(saved.title, session.title);
        assert_eq!(saved.raw_memo_html, session.raw_memo_html);
        assert_eq!(saved.enhanced_memo_html, session.enhanced_memo_html);
        assert_eq!(
            saved.auto_enhanced_memo_html.as_deref(),
            Some("Generated summary")
        );
        assert!(!saved.needs_enhance);
        assert!(!db
            .save_recording_summary(&session.id, &words, ended, None, "Duplicate")
            .await
            .unwrap());
        // A restarted recording cannot accept the previous recording's summary.
        session.record_end = None;
        session.needs_enhance = true;
        db.upsert_session(session.clone()).await.unwrap();
        assert!(!db
            .save_recording_summary(&session.id, &words, ended, None, "Stale run")
            .await
            .unwrap());
        // Nor can an amended transcript accept a summary based on old words.
        session.record_end = Some(ended);
        session.words.pop();
        db.upsert_session(session.clone()).await.unwrap();
        assert!(!db
            .save_recording_summary(&session.id, &words, ended, None, "Stale words")
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn recording_summary_saves_generated_notes_and_duplicate_completion_does_not_requeue() {
        let db = setup_db().await;
        let session = recording(&db).await;
        db.complete_recording(&session.id, true).await.unwrap();
        let completed = db
            .get_session(crate::GetSessionFilter::Id(session.id.clone()))
            .await
            .unwrap()
            .unwrap();
        assert!(db
            .save_recording_summary(
                &session.id,
                &serde_json::to_string(&session.words).unwrap(),
                completed.record_end.unwrap(),
                None,
                "Generated summary",
            )
            .await
            .unwrap());
        db.complete_recording(&session.id, true).await.unwrap();
        let saved = db
            .get_session(crate::GetSessionFilter::Id(session.id))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            saved.enhanced_memo_html.as_deref(),
            Some("Generated summary")
        );
        assert!(!saved.needs_enhance);
    }

    #[tokio::test]
    async fn completion_ignores_too_short_transcripts_and_template_updates_preserve_provenance() {
        let db = setup_db().await;
        let mut session = recording(&db).await;
        session.words.truncate(4);
        session.source_metadata = Some(r#"{"source":"meeting"}"#.into());
        db.upsert_session(session.clone()).await.unwrap();
        db.set_summary_template(&session.id, Some("template-1".into()))
            .await
            .unwrap();
        db.complete_recording(&session.id, true).await.unwrap();
        let saved = db
            .get_session(crate::GetSessionFilter::Id(session.id.clone()))
            .await
            .unwrap()
            .unwrap();
        assert!(!saved.needs_enhance);
        let metadata: serde_json::Value =
            serde_json::from_str(saved.source_metadata.as_deref().unwrap()).unwrap();
        assert_eq!(metadata["source"], "meeting");
        assert_eq!(metadata["summary_template_id"], "template-1");
        db.set_summary_template(&session.id, None).await.unwrap();
        let saved = db
            .get_session(crate::GetSessionFilter::Id(session.id))
            .await
            .unwrap()
            .unwrap();
        assert!(serde_json::from_str::<serde_json::Value>(
            saved.source_metadata.as_deref().unwrap()
        )
        .unwrap()["summary_template_id"]
            .is_null());
    }

    #[tokio::test]
    async fn queued_note_edits_and_transcript_appends_preserve_native_completion() {
        let db = setup_db().await;
        let session = recording(&db).await;
        let queued_edit = vec![crate::SessionNoteUpdate::RawMemoHtml(
            "Queued memo edit".into(),
        )];
        db.set_summary_template(&session.id, Some("chosen".into()))
            .await
            .unwrap();
        db.complete_recording(&session.id, true).await.unwrap();
        let completed = db
            .get_session(crate::GetSessionFilter::Id(session.id.clone()))
            .await
            .unwrap()
            .unwrap();
        db.update_session_note_fields(&session.id, queued_edit)
            .await
            .unwrap();
        let pending = db
            .get_session(crate::GetSessionFilter::Id(session.id.clone()))
            .await
            .unwrap()
            .unwrap();
        assert!(pending.needs_enhance);
        assert_eq!(pending.record_end, completed.record_end);
        assert!(db
            .save_recording_summary(
                &session.id,
                &serde_json::to_string(&session.words).unwrap(),
                completed.record_end.unwrap(),
                None,
                "Generated"
            )
            .await
            .unwrap());
        // A second edit queued before generation must not erase/requeue its result.
        let saved = db
            .update_session_note_fields(
                &session.id,
                vec![crate::SessionNoteUpdate::Title("User title".into())],
            )
            .await
            .unwrap()
            .unwrap();
        assert_eq!(saved.raw_memo_html, "Queued memo edit");
        assert_eq!(saved.enhanced_memo_html.as_deref(), Some("Generated"));
        assert!(!saved.needs_enhance);
        assert_eq!(saved.record_end, completed.record_end);
        let appended = db
            .append_session_words(&session.id, vec![session.words[0].clone()])
            .await
            .unwrap();
        assert_eq!(appended.len(), 6);
        let after_append = db
            .get_session(crate::GetSessionFilter::Id(session.id))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(after_append.title, "User title");
        assert_eq!(after_append.enhanced_memo_html, saved.enhanced_memo_html);
        assert_eq!(after_append.source_metadata, saved.source_metadata);
    }

    #[tokio::test]
    async fn next_run_snapshots_default_template_and_failed_flush_does_not_queue_summary() {
        let db = setup_db().await;
        let session = recording(&db).await;
        db.set_summary_template(&session.id, Some("previous-run".into()))
            .await
            .unwrap();
        db.complete_recording(&session.id, true).await.unwrap();
        db.begin_recording(&session.id, Some("new-default".into()))
            .await
            .unwrap();
        db.mark_recording_started(&session.id).await.unwrap();
        let started = db
            .get_session(crate::GetSessionFilter::Id(session.id.clone()))
            .await
            .unwrap()
            .unwrap();
        assert!(started.record_end.is_none());
        assert!(!started.needs_enhance);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(started.source_metadata.as_deref().unwrap())
                .unwrap()["summary_template_id"],
            "new-default"
        );
        db.set_summary_template(&session.id, Some("explicit-choice".into()))
            .await
            .unwrap();
        // Resume only marks running; it must not replace the current run's choice.
        db.mark_recording_started(&session.id).await.unwrap();
        db.complete_recording(&session.id, false).await.unwrap();
        let failed = db
            .get_session(crate::GetSessionFilter::Id(session.id))
            .await
            .unwrap()
            .unwrap();
        assert!(failed.record_end.is_some());
        assert!(!failed.needs_enhance);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(failed.source_metadata.as_deref().unwrap())
                .unwrap()["summary_template_id"],
            "explicit-choice"
        );
    }

    #[tokio::test]
    async fn pending_query_can_skip_backoff_jobs_without_starving_later_recordings() {
        let db = setup_db().await;
        let mut session = recording(&db).await;
        session.record_end = Some(chrono::Utc::now());
        let mut excluded = vec![];
        for i in 0..11 {
            session.id = uuid::Uuid::new_v4().to_string();
            session.created_at += chrono::Duration::seconds(1);
            session.needs_enhance = true;
            db.upsert_session(session.clone()).await.unwrap();
            if i < 10 {
                excluded.push(session.id.clone());
            }
        }
        let ready = db
            .list_sessions(Some(crate::ListSessionFilter {
                common: crate::ListSessionFilterCommon {
                    user_id: session.user_id,
                    limit: Some(10),
                },
                specific: crate::ListSessionFilterSpecific::NeedsEnhance {
                    exclude_ids: Some(excluded),
                },
            }))
            .await
            .unwrap();
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, session.id);
    }

    #[tokio::test]
    async fn generated_recording_titles_preserve_rename_and_reject_prior_runs() {
        let db = setup_db().await;
        let session = recording(&db).await;
        db.complete_recording(&session.id, true).await.unwrap();
        let ended = db
            .get_session(crate::GetSessionFilter::Id(session.id.clone()))
            .await
            .unwrap()
            .unwrap()
            .record_end
            .unwrap();
        db.update_session_note_fields(
            &session.id,
            vec![crate::SessionNoteUpdate::Title("Renamed".into())],
        )
        .await
        .unwrap();
        assert!(!db
            .save_recording_title(&session.id, ended, &session.title, "Generated title")
            .await
            .unwrap());
        assert!(db
            .save_recording_title(&session.id, ended, "Renamed", "Explicit baseline matches")
            .await
            .unwrap());
        db.begin_recording(&session.id, None).await.unwrap();
        assert!(!db
            .save_recording_title(
                &session.id,
                ended,
                "Explicit baseline matches",
                "Prior run title"
            )
            .await
            .unwrap());
    }
}
