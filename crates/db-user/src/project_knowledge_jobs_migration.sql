CREATE TABLE IF NOT EXISTS project_knowledge_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  model_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  run_after TEXT NOT NULL,
  queued_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES spaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_jobs_project_status ON project_knowledge_jobs(project_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_jobs_claim ON project_knowledge_jobs(status, run_after, queued_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_knowledge_jobs_active_dedupe ON project_knowledge_jobs(dedupe_key)
WHERE
  status IN ('Queued', 'Running');
