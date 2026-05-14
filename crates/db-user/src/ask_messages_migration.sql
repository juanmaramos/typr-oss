CREATE TABLE IF NOT EXISTS ask_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  model_id TEXT DEFAULT NULL,
  FOREIGN KEY (thread_id) REFERENCES ask_threads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ask_messages_thread_created ON ask_messages(thread_id, created_at ASC);
