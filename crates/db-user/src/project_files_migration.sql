CREATE TABLE IF NOT EXISTS project_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT DEFAULT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT DEFAULT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES spaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_files_project_updated ON project_files(project_id, updated_at DESC);
