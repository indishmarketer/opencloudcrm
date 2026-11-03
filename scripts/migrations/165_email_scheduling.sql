-- Schedule newsletter campaigns and one-off contact emails. All timestamps
-- are stored as timestamptz; console inputs are interpreted explicitly as IST.

ALTER TABLE newsletter_campaigns
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_scheduled
  ON newsletter_campaigns(scheduled_at)
  WHERE status = 'scheduled';

CREATE TABLE IF NOT EXISTS contact_email_scheduled (
  id BIGSERIAL PRIMARY KEY,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  reply_to TEXT,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'skipped', 'cancelled', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  email_delivery_id BIGINT REFERENCES email_deliveries(id) ON DELETE SET NULL,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_email_scheduled_due
  ON contact_email_scheduled(scheduled_at)
  WHERE status = 'pending';
