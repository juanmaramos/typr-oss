CREATE TABLE IF NOT EXISTS project_brief_refreshes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  brief_id TEXT DEFAULT NULL,
  status TEXT NOT NULL,
  refresh_mode TEXT NOT NULL,
  model_id TEXT DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT DEFAULT NULL,
  FOREIGN KEY (project_id) REFERENCES spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (brief_id) REFERENCES project_briefs(id) ON DELETE
  SET
    NULL
);
CREATE INDEX IF NOT EXISTS idx_project_brief_refreshes_project_started ON project_brief_refreshes(project_id, started_at DESC);
