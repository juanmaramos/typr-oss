CREATE TABLE IF NOT EXISTS ask_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT DEFAULT NULL,
  title TEXT DEFAULT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT DEFAULT NULL,
  archived_at TEXT DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES humans(id)
);
CREATE INDEX IF NOT EXISTS idx_ask_threads_user_updated ON ask_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ask_threads_scope ON ask_threads(scope_type, scope_id, updated_at DESC);
