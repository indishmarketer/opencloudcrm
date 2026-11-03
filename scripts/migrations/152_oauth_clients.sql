-- Dynamic OAuth client registration storage for the remote MCP server's
-- OAuth shim (see src/app/oauth/*). Public clients only (PKCE, no
-- client_secret) -- Claude.ai and other MCP clients register themselves
-- on the fly via POST /oauth/register, then redirect_uris here is what
-- /oauth/authorize validates the callback against before ever redirecting.
CREATE TABLE IF NOT EXISTS oauth_clients (
  id SERIAL PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  redirect_uris TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
