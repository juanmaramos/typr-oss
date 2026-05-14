CREATE TABLE IF NOT EXISTS project_source_chunks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  source_locator TEXT DEFAULT NULL,
  title TEXT NOT NULL,
  text_content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, source_type, source_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_project_source_chunks_source ON project_source_chunks(project_id, source_type, source_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_project_source_chunks_hash ON project_source_chunks(project_id, source_type, source_id, source_hash);
