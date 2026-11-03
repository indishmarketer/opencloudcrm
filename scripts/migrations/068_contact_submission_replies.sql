BEGIN;

-- contact_submissions previously held at most one reply ever (reply_text/
-- replied_at are single columns) -- once an admin replied once, the console
-- UI hid the reply box permanently, and a second inbound message from the
-- same person showed as a disconnected card instead of continuing the
-- conversation. This table holds the full reply history per submission so
-- a real back-and-forth thread is possible.
CREATE TABLE IF NOT EXISTS contact_submission_replies (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
  admin_email TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_submission_replies_submission
  ON contact_submission_replies(submission_id, sent_at);

-- Preserve any existing single reply as the first row of its new history.
INSERT INTO contact_submission_replies (submission_id, admin_email, message, sent_at)
SELECT id, '', reply_text, replied_at FROM contact_submissions
WHERE reply_text IS NOT NULL AND replied_at IS NOT NULL;

COMMIT;
