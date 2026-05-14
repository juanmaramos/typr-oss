CREATE TABLE IF NOT EXISTS project_file_extractions (
  file_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  text_content TEXT DEFAULT NULL,
  content_hash TEXT DEFAULT NULL,
  char_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT DEFAULT NULL,
  extracted_at TEXT DEFAULT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (file_id) REFERENCES project_files(id) ON DELETE CASCADE
);
