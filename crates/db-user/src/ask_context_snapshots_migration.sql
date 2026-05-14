CREATE TABLE IF NOT EXISTS ask_context_snapshots (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  scope_type TEXT NOT NULL,
  scope_id TEXT DEFAULT NULL,
  context_mode TEXT NOT NULL,
  model_id TEXT DEFAULT NULL,
  source_count INTEGER NOT NULL,
  source_limit INTEGER NOT NULL,
  sources_json TEXT NOT NULL,
  messages_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES ask_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES ask_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ask_context_snapshots_thread_created ON ask_context_snapshots(thread_id, created_at ASC);
