-- Self-service account deletion support. Deletion anonymizes the users
-- row in place (email/name/username/avatar/bio scrubbed, session_version
-- bumped to invalidate active sessions) rather than DELETE-ing the row --
-- this deliberately avoids cascading into payment_claims (financial
-- records normally need to be retained regardless of an account-deletion
-- request) and forum_posts/forum_comments (kept, but now show as
-- "Deleted user" once the account is anonymized, so other people's
-- threads don't break). See src/lib/accountDeletion.ts.

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
