-- Add parts column to store rich message components (diff previews, markdown, etc.)
ALTER TABLE
  chat_messages
ADD
  COLUMN parts TEXT DEFAULT NULL;
