-- 149_api_tokens_scopes.sql added the new `scopes` array column but missed
-- that the old `scope` column is still NOT NULL with no default (caught by
-- describe_table before deploying the code that inserts without it) --
-- every new token issued through the unified console UI only sets `scopes`,
-- never `scope`, so that insert would fail in production without this.
-- Same relaxation 023_fix_api_tokens_schema.sql already did for `name`/`token`.
ALTER TABLE api_tokens ALTER COLUMN scope DROP NOT NULL;
