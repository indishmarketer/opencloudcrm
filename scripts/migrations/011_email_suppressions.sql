-- Global "don't email this address" list. Any email's unsubscribe link
-- (see src/lib/email.ts) adds the recipient here, and every future
-- sendEmail() call checks it before sending (except explicitly-critical
-- account-security mail like password resets).
CREATE TABLE IF NOT EXISTS email_suppressions (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
