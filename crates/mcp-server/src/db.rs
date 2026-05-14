use anyhow::{Context, Result};
use typr_db_core::DatabaseBuilder;
use typr_db_user::{Session, UserDatabase};
use std::path::PathBuf;

const SESSION_SELECT_COLUMNS: &str = "SELECT DISTINCT s.id, s.created_at, s.visited_at, s.user_id, s.calendar_event_id, s.title, s.raw_memo_html, s.enhanced_memo_html, s.conversations, s.words, s.record_start, s.record_end, s.pre_meeting_memo_html, s.source_type, s.source_metadata, s.space_id, s.auto_enhanced_memo_html, s.needs_enhance FROM sessions s";

#[derive(Debug, Default)]
pub struct SessionSearchFilters {
    pub query: Option<String>,
    pub tag_ids: Vec<String>,
    pub tag_names: Vec<String>,
    pub project_ids: Vec<String>,
    pub project_names: Vec<String>,
    pub limit: usize,
}

/// Opens the local Typr database
///
/// Looks for database in this order:
/// 1. TYPR_DB_PATH environment variable
/// 2. Platform-specific data directory (~/Library/Application Support/com.typr.stable/db.sqlite on macOS)
pub async fn open_local_db() -> Result<UserDatabase> {
    let db_path = get_db_path()?;

    eprintln!("Opening database at: {}", db_path.display());

    let db = DatabaseBuilder::default()
        .local(db_path.to_string_lossy().to_string())
        .build()
        .await
        .context("Failed to open Typr database")?;

    Ok(UserDatabase::from(db))
}

fn get_db_path() -> Result<PathBuf> {
    // Check environment variable first
    if let Ok(path) = std::env::var("TYPR_DB_PATH") {
        return Ok(PathBuf::from(path));
    }

    // Default platform-specific path matching Tauri's app data directory
    let data_dir = if cfg!(target_os = "macos") {
        dirs::home_dir()
            .context("Could not find home directory")?
            .join("Library/Application Support/com.typr.stable")
    } else if cfg!(target_os = "windows") {
        dirs::data_local_dir()
            .context("Could not find AppData directory")?
            .join("com.typr.stable")
    } else {
        dirs::data_local_dir()
            .context("Could not find data directory")?
            .join("com.typr.stable")
    };

    Ok(data_dir.join("db.sqlite"))
}

pub async fn search_sessions(
    db: &UserDatabase,
    filters: SessionSearchFilters,
) -> Result<Vec<Session>> {
    let conn = db.conn()?;
    let (sql, params) = build_session_search_query(filters);

    let mut rows = conn.query(&sql, params).await?;
    let mut sessions = Vec::new();
    while let Some(row) = rows.next().await? {
        sessions.push(Session::from_row(&row)?);
    }

    Ok(sessions)
}

fn build_session_search_query(filters: SessionSearchFilters) -> (String, Vec<String>) {
    let mut sql = format!("{} WHERE 1 = 1", SESSION_SELECT_COLUMNS);
    let mut params: Vec<String> = Vec::new();

    if let Some(query) = normalize_text_filter(filters.query) {
        let pattern = format!("%{}%", query);
        sql.push_str(
            " AND (
                s.title LIKE ?
                OR REPLACE(REPLACE(REPLACE(COALESCE(s.enhanced_memo_html, ''), '<', ' '), '>', ' '), '&nbsp;', ' ') LIKE ?
                OR REPLACE(REPLACE(REPLACE(COALESCE(s.auto_enhanced_memo_html, ''), '<', ' '), '>', ' '), '&nbsp;', ' ') LIKE ?
                OR REPLACE(REPLACE(REPLACE(COALESCE(s.raw_memo_html, ''), '<', ' '), '>', ' '), '&nbsp;', ' ') LIKE ?
                OR EXISTS (
                    SELECT 1
                    FROM session_participants sp
                    JOIN humans h ON sp.human_id = h.id
                    WHERE sp.session_id = s.id
                    AND (COALESCE(h.full_name, '') LIKE ? OR COALESCE(h.email, '') LIKE ?)
                )
            )",
        );
        params.extend([
            pattern.clone(),
            pattern.clone(),
            pattern.clone(),
            pattern.clone(),
            pattern.clone(),
            pattern,
        ]);
    }

    append_tag_filter(&mut sql, &mut params, filters.tag_ids, filters.tag_names);
    append_project_filter(
        &mut sql,
        &mut params,
        filters.project_ids,
        filters.project_names,
    );

    sql.push_str(" ORDER BY s.created_at DESC LIMIT ?");
    params.push(filters.limit.max(1).min(250).to_string());

    (sql, params)
}

fn append_tag_filter(
    sql: &mut String,
    params: &mut Vec<String>,
    tag_ids: Vec<String>,
    tag_names: Vec<String>,
) {
    let tag_ids = normalize_list(tag_ids, false);
    let tag_names = normalize_list(tag_names, true);

    if tag_ids.is_empty() && tag_names.is_empty() {
        return;
    }

    let mut conditions = Vec::new();
    if !tag_ids.is_empty() {
        conditions.push(format!("t.id IN ({})", placeholders(tag_ids.len())));
        params.extend(tag_ids);
    }
    if !tag_names.is_empty() {
        conditions.push(format!(
            "LOWER(t.name) IN ({})",
            placeholders(tag_names.len())
        ));
        params.extend(tag_names);
    }

    sql.push_str(
        " AND EXISTS (
            SELECT 1
            FROM tags_sessions ts
            JOIN tags t ON t.id = ts.tag_id
            WHERE ts.session_id = s.id
            AND (",
    );
    sql.push_str(&conditions.join(" OR "));
    sql.push_str("))");
}

fn append_project_filter(
    sql: &mut String,
    params: &mut Vec<String>,
    project_ids: Vec<String>,
    project_names: Vec<String>,
) {
    let project_ids = normalize_list(project_ids, false);
    let project_names = normalize_list(project_names, true);

    if project_ids.is_empty() && project_names.is_empty() {
        return;
    }

    let mut conditions = Vec::new();
    if !project_ids.is_empty() {
        conditions.push(format!("p.id IN ({})", placeholders(project_ids.len())));
        params.extend(project_ids);
    }
    if !project_names.is_empty() {
        conditions.push(
            project_names
                .iter()
                .map(|_| "LOWER(p.name) LIKE ?".to_string())
                .collect::<Vec<_>>()
                .join(" OR "),
        );
        params.extend(project_names.into_iter().map(|name| format!("%{}%", name)));
    }

    sql.push_str(
        " AND EXISTS (
            SELECT 1
            FROM spaces p
            WHERE p.id = s.space_id
            AND (",
    );
    sql.push_str(&conditions.join(" OR "));
    sql.push_str("))");
}

fn normalize_text_filter(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalize_list(values: Vec<String>, lowercase: bool) -> Vec<String> {
    values
        .into_iter()
        .filter_map(|value| {
            let value = value.trim();
            if value.is_empty() {
                None
            } else if lowercase {
                Some(value.to_lowercase())
            } else {
                Some(value.to_string())
            }
        })
        .collect()
}

fn placeholders(count: usize) -> String {
    std::iter::repeat("?")
        .take(count)
        .collect::<Vec<_>>()
        .join(",")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_combined_keyword_tag_and_project_query() {
        let (sql, params) = build_session_search_query(SessionSearchFilters {
            query: Some("roadmap".to_string()),
            tag_ids: vec!["tag-id".to_string()],
            tag_names: vec!["Strategy".to_string()],
            project_ids: vec!["project-id".to_string()],
            project_names: vec!["Launch".to_string()],
            limit: 25,
        });

        assert!(sql.contains("s.title LIKE ?"));
        assert!(sql.contains("tags_sessions"));
        assert!(sql.contains("LOWER(t.name) IN (?)"));
        assert!(sql.contains("spaces p"));
        assert!(sql.contains("LOWER(p.name) LIKE ?"));
        assert_eq!(
            params,
            vec![
                "%roadmap%",
                "%roadmap%",
                "%roadmap%",
                "%roadmap%",
                "%roadmap%",
                "%roadmap%",
                "tag-id",
                "strategy",
                "project-id",
                "%launch%",
                "25",
            ]
        );
    }

    #[test]
    fn clamps_limit_and_ignores_empty_filters() {
        let (sql, params) = build_session_search_query(SessionSearchFilters {
            query: Some("  ".to_string()),
            tag_ids: vec!["".to_string()],
            tag_names: vec![" ".to_string()],
            project_ids: vec![],
            project_names: vec![],
            limit: 999,
        });

        assert!(!sql.contains("tags_sessions"));
        assert!(!sql.contains("spaces p"));
        assert_eq!(params, vec!["250"]);
    }
}
