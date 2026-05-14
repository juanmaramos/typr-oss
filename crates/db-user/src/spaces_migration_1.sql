ALTER TABLE
  spaces
ADD
  COLUMN icon_type TEXT NOT NULL DEFAULT 'remix';
ALTER TABLE
  spaces
ADD
  COLUMN icon_value TEXT NOT NULL DEFAULT 'ri-folder-3-line';
ALTER TABLE
  spaces
ADD
  COLUMN icon_color TEXT NOT NULL DEFAULT 'neutral';
