-- Cleanup legacy orphan tags left behind before orphan-removal logic existed.
DELETE FROM
  tags
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      tags_sessions
    WHERE
      tags_sessions.tag_id = tags.id
  );
