CREATE TABLE IF NOT EXISTS user_template_favorites (
  user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, template_id),
  FOREIGN KEY (user_id) REFERENCES humans(id)
);
-- Index for performance
CREATE INDEX IF NOT EXISTS idx_user_template_favorites_user_id ON user_template_favorites(user_id);
