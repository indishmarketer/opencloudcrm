-- Require email verification before a NEW signup gets a real session/access.
-- Existing accounts are grandfathered as verified (they already proved
-- access via a real working login before this feature existed) so this
-- doesn't lock anyone out.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;
