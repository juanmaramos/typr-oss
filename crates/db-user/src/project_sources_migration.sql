CREATE TABLE IF NOT EXISTS project_sources (
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL,
  added_by TEXT NOT NULL,
  relevance_score REAL DEFAULT NULL,
  relevance_reason TEXT DEFAULT NULL,
  reviewed_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, session_id),
  FOREIGN KEY (project_id) REFERENCES spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
INSERT
  OR IGNORE INTO project_sources (
    project_id,
    session_id,
    status,
    added_by,
    relevance_score,
    relevance_reason,
    reviewed_at,
    created_at,
    updated_at
  )
SELECT
  space_id,
  id,
  'Included',
  'User',
  NULL,
  NULL,
  NULL,
  created_at,
  visited_at
FROM
  sessions
WHERE
  space_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_sources_project_status ON project_sources(project_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_sources_session ON project_sources(session_id);
