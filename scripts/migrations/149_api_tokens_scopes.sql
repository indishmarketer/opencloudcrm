-- Generalizes api_tokens from one hardcoded scope string per token to a
-- list of scopes (e.g. {directory:write, blog:read, blog:write}), so one
-- token can be issued for the unified /api/v1/* surface instead of a
-- separate token system per feature. Additive: keeps the old `scope`
-- column (nothing reads it after this migration, but dropping it isn't
-- necessary and would lose history for no benefit) and backfills the new
-- `scopes` array from it so existing directory:submit tokens keep working.
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS created_by TEXT;

UPDATE api_tokens
SET scopes = ARRAY[scope]
WHERE scope IS NOT NULL AND scopes = '{}';

-- The old directory API-key feature used the scope name "directory:submit";
-- the unified API renames it to "directory:write" for consistency with
-- every other resource's read/write scope naming.
UPDATE api_tokens
SET scopes = ARRAY['directory:write']
WHERE scope = 'directory:submit';
