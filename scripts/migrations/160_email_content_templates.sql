-- Reusable email content: a subject + HTML body an admin writes once and
-- reuses across campaigns, automation steps, and one-off contact emails.
-- Distinct from email_templates (fixed, code-referenced transactional
-- sends like password resets) -- these are freely created, edited, and
-- deleted, and never sent on their own; selecting one just copies its
-- content into whatever composer the admin is using.

CREATE TABLE email_content_templates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE INDEX idx_email_content_templates_name ON email_content_templates (name);
