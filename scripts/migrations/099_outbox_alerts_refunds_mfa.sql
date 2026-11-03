-- Reliability, refunds and console 2-step login.

BEGIN;

-- Transactional emails (course access, receipts, owner alerts) that failed
-- on the first try. The email-dispatch cron retries them with backoff and
-- raises an alert once retries run out. See src/lib/emailOutbox.ts.
CREATE TABLE IF NOT EXISTS email_outbox (
  id bigserial PRIMARY KEY,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 1,
  next_attempt_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_due ON email_outbox (next_attempt_at) WHERE status = 'pending';

-- Things the owner needs to look at: failed sends, refunds, disputes, email
-- health. One row per distinct problem (dedupe_key); emailed in a digest
-- and listed at /console/attention until resolved. See src/lib/systemAlerts.ts.
CREATE TABLE IF NOT EXISTS system_alerts (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  title text NOT NULL,
  detail text,
  link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  emailed_at timestamptz,
  resolved_at timestamptz,
  resolved_by text
);
CREATE INDEX IF NOT EXISTS idx_system_alerts_open ON system_alerts (created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_system_alerts_unemailed ON system_alerts (created_at) WHERE emailed_at IS NULL;

-- Refunds and disputes recorded against the original payment.
ALTER TABLE payment_claims ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE payment_claims ADD COLUMN IF NOT EXISTS refund_amount numeric(12,2);
ALTER TABLE payment_claims ADD COLUMN IF NOT EXISTS disputed_at timestamptz;

-- Console 2-step login (authenticator app). Secret is AES-GCM encrypted
-- (src/lib/secureCredential.ts); recovery codes are stored as SHA-256 hashes.
CREATE TABLE IF NOT EXISTS console_mfa (
  email text PRIMARY KEY,
  secret_encrypted text NOT NULL,
  recovery_hashes text[] NOT NULL DEFAULT '{}',
  enabled_at timestamptz,
  last_used_step bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
