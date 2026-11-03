BEGIN;

-- Carries the signup-form "send me occasional updates" checkbox choice
-- through to email verification, where it's actually acted on (promoting
-- the contact to marketing_status='subscribed') -- deferred to verification,
-- same as account activation itself, so a mistyped/someone-else's email
-- never gets marked as having opted into marketing.
ALTER TABLE users ADD COLUMN IF NOT EXISTS updates_opt_in BOOLEAN NOT NULL DEFAULT false;

COMMIT;
