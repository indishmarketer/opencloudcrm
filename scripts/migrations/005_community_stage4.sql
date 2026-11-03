-- Community forum, Stage 4: bans + moderation.
-- Safe to re-run: every statement is IF NOT EXISTS / additive.

CREATE TABLE IF NOT EXISTS community_bans (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_bans_user ON community_bans(user_id);
