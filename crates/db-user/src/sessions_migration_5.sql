-- Add source tracking fields for YouTube and other import sources
ALTER TABLE
  sessions
ADD
  COLUMN source_type TEXT DEFAULT 'manual';
ALTER TABLE
  sessions
ADD
  COLUMN source_metadata TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_source_usage ON sessions(user_id, source_type, created_at);
