-- Production signups are code-configured to receive email updates after
-- their address is verified. Application code sets this explicitly; the
-- default also keeps terminal/MCP-created users consistent.
ALTER TABLE users ALTER COLUMN updates_opt_in SET DEFAULT true;
