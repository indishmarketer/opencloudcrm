-- Distinguishes a manually-created API token (console's own "Create
-- token" form) from one a remote MCP client (Claude.ai, etc.) obtained
-- itself via the OAuth shim (src/app/oauth/token/route.ts) when
-- connecting. Lets the console split "API tokens" from "MCP tokens"
-- instead of lumping every key into one undifferentiated list.
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS issued_via TEXT NOT NULL DEFAULT 'manual' CHECK (issued_via IN ('manual', 'oauth'));

UPDATE api_tokens SET issued_via = 'oauth' WHERE label LIKE 'OAuth: %';
