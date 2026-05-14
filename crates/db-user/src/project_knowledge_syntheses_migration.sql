CREATE TABLE IF NOT EXISTS project_knowledge_syntheses (
  project_id TEXT PRIMARY KEY NOT NULL,
  source_fingerprint TEXT NOT NULL,
  source_count INTEGER NOT NULL,
  model_id TEXT,
  key_claims_json TEXT NOT NULL,
  contradictions_json TEXT NOT NULL,
  changes_json TEXT NOT NULL,
  open_questions_json TEXT NOT NULL,
  synthesis_markdown TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES spaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_syntheses_updated ON project_knowledge_syntheses(updated_at DESC);
