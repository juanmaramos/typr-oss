ALTER TABLE
  sessions
ADD
  COLUMN space_id TEXT DEFAULT NULL REFERENCES spaces(id);
CREATE INDEX IF NOT EXISTS idx_sessions_space_id ON sessions(space_id);
