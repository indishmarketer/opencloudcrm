-- A question belongs to the exact simulated-live broadcast in which it was asked.
ALTER TABLE webinar_comments
  ADD COLUMN IF NOT EXISTS session_start_at TIMESTAMPTZ;

UPDATE webinar_comments wc
SET session_start_at = wa.session_start_at
FROM webinar_access wa
WHERE wc.webinar_id = wa.webinar_id
  AND wc.user_id = wa.user_id
  AND wc.session_start_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_webinar_comments_occurrence
  ON webinar_comments(webinar_id, session_start_at, created_at DESC)
  WHERE is_question = true;
