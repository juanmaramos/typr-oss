CREATE TABLE IF NOT EXISTS project_source_digests (
  project_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  digest_source_kind TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  summary TEXT NOT NULL,
  claims_json TEXT NOT NULL,
  entities_json TEXT NOT NULL,
  open_questions_json TEXT NOT NULL,
  decisions_json TEXT NOT NULL,
  risks_json TEXT NOT NULL,
  digest_markdown TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_project_source_digests_project ON project_source_digests(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_source_digests_hash ON project_source_digests(project_id, source_type, source_id, source_hash);
