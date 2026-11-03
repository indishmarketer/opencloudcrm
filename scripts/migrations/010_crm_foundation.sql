-- Unified contacts / mini-CRM foundation.
-- Safe to re-run: every statement is IF NOT EXISTS / additive.

-- Link previously-anonymous lead capture to an account when one exists.
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contact_submissions_user ON contact_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_email ON contact_submissions(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_user ON newsletter_subscribers(user_id);

-- Attribution capture + the per-contact event timeline, one structure for both.
CREATE TABLE IF NOT EXISTS attribution_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email TEXT,
  event_type TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  referrer TEXT,
  landing_page TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attribution_events_user ON attribution_events(user_id);
CREATE INDEX IF NOT EXISTS idx_attribution_events_email ON attribution_events(email);
CREATE INDEX IF NOT EXISTS idx_attribution_events_created ON attribution_events(created_at);

-- Internal-only notes on a contact.
CREATE TABLE IF NOT EXISTS contact_notes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  body TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_notes_user ON contact_notes(user_id);

-- Payments never recorded the actual amount/currency paid, only method/status.
ALTER TABLE payment_claims ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2);
ALTER TABLE payment_claims ADD COLUMN IF NOT EXISTS currency TEXT;
