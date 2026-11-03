-- api_tokens already existed in production from an earlier, unrelated
-- newsletter-token feature (id, name, token, scope default 'newsletter:send',
-- created_at, last_used_at). Migration 021's CREATE TABLE IF NOT EXISTS
-- silently no-opped against it, so the directory API-key code (label,
-- token_hash, key_prefix, revoked_at) was inserting into columns that
-- never existed. No code reads the old name/token/scope='newsletter:send'
-- columns (grep-verified), so this just adds what's missing and relaxes
-- the old NOT NULL constraints that would otherwise reject new rows.
ALTER TABLE api_tokens ALTER COLUMN name DROP NOT NULL;
ALTER TABLE api_tokens ALTER COLUMN token DROP NOT NULL;
ALTER TABLE api_tokens ALTER COLUMN scope DROP DEFAULT;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS key_prefix TEXT;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_token_hash_key UNIQUE (token_hash);
