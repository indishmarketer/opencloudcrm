-- api_tokens already existed in production from an earlier, unrelated
-- newsletter-token feature (id, name, token, scope default 'newsletter:send',
-- created_at, last_used_at). Migration 021's CREATE TABLE IF NOT EXISTS
-- silently no-opped against it, so the directory API-key code (label,
-- token_hash, key_prefix, revoked_at) was inserting into columns that
-- never existed. No code reads the old name/token/scope='newsletter:send'
-- columns (grep-verified), so this just adds what's missing and relaxes
-- the old NOT NULL constraints that would otherwise reject new rows.
--
-- On a fresh database there's no legacy table to collide with -- 021's
-- CREATE TABLE runs for real and already creates the modern shape
-- directly, `name`/`token` never exist, and its inline `UNIQUE` on
-- token_hash already claims the exact constraint name this file adds
-- below (Postgres's default naming). Every legacy-specific statement is
-- guarded so this is a clean no-op there.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_tokens' AND column_name = 'name') THEN
    ALTER TABLE api_tokens ALTER COLUMN name DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_tokens' AND column_name = 'token') THEN
    ALTER TABLE api_tokens ALTER COLUMN token DROP NOT NULL;
  END IF;
END $$;
ALTER TABLE api_tokens ALTER COLUMN scope DROP DEFAULT;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS key_prefix TEXT;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_tokens_token_hash_key') THEN
    ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_token_hash_key UNIQUE (token_hash);
  END IF;
END $$;
