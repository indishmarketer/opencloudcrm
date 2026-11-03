-- Revives newsletter_campaigns/newsletter_sends (dormant since migration 014
-- replaced the old "compose and blast" feature with automation) as a real
-- draft -> send workflow, queued the same way email_flow_scheduled already
-- is: rows go in as 'pending', a batch sends immediately on click, and the
-- daily cron dispatcher mops up anything left over for a large list.

ALTER TABLE newsletter_campaigns
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS from_email TEXT NOT NULL DEFAULT 'hello@example.com',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE newsletter_campaigns ALTER COLUMN sent_at DROP NOT NULL;
ALTER TABLE newsletter_campaigns ALTER COLUMN sent_at DROP DEFAULT;

ALTER TABLE newsletter_sends
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE newsletter_sends ALTER COLUMN sent_at DROP NOT NULL;
ALTER TABLE newsletter_sends ALTER COLUMN sent_at DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_newsletter_sends_pending ON newsletter_sends(status) WHERE status = 'pending';
