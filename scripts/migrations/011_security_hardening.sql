-- Single-use tracking for password-reset and admin magic-link JWTs, which
-- were previously pure stateless tokens reusable until expiry.
-- Safe to re-run: every statement is IF NOT EXISTS / additive.

CREATE TABLE IF NOT EXISTS used_auth_tokens (
  jti TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Newsletter unsubscribe tracking.
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;
