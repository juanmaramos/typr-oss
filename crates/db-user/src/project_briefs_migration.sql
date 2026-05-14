CREATE TABLE IF NOT EXISTS project_briefs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  markdown TEXT NOT NULL,
  status TEXT NOT NULL,
  source_count INTEGER NOT NULL,
  source_limit INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL,
  model_id TEXT DEFAULT NULL,
  prompt_template_version TEXT NOT NULL,
  error_message TEXT DEFAULT NULL,
  generated_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES spaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_briefs_project_updated ON project_briefs(project_id, updated_at DESC);
