CREATE TABLE IF NOT EXISTS project_brief_sources (
  brief_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (brief_id, source_type, source_id),
  FOREIGN KEY (brief_id) REFERENCES project_briefs(id) ON DELETE CASCADE
);
