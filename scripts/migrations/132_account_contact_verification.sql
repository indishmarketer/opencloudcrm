-- Changing your own email address or phone number now has to be proved.
--
-- Email: a link goes to the NEW address and the change only lands when
-- that link is opened. Until then the old address stays live, so someone
-- who gets into an account cannot lock the owner out by swapping the
-- address to one they control.
--
-- Phone: a numeric code goes out over WhatsApp and has to be typed back,
-- which also proves the number can actually receive WhatsApp, which is the
-- whole reason the number is collected.
--
-- Neither table stores the secret. The token and the code are hashed, the
-- same way password reset already works, so a dump of this table cannot be
-- replayed.

CREATE TABLE IF NOT EXISTS account_email_changes (
  id            bigserial PRIMARY KEY,
  user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email     text NOT NULL,
  token_hash    text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_account_email_changes_open
  ON account_email_changes (user_id, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS account_phone_verifications (
  id            bigserial PRIMARY KEY,
  user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone         text NOT NULL,
  code_hash     text NOT NULL,
  -- Counted so a six digit code cannot be brute forced by a few thousand
  -- guesses against a row that stays valid for ten minutes.
  attempts      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_account_phone_verifications_open
  ON account_phone_verifications (user_id, created_at DESC)
  WHERE consumed_at IS NULL;

-- Which numbers have actually been proved. A number typed in at signup or
-- filled by a payment gateway is unverified until its owner confirms it.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
