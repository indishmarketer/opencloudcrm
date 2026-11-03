-- Community forum, Stage 2: PRO forum gating + categories.
-- Safe to re-run: every statement is IF NOT EXISTS / additive.

CREATE TABLE IF NOT EXISTS community_memberships (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active','cancelled','expired')),
  source TEXT NOT NULL,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

INSERT INTO community_categories (space, name, slug, description, position) VALUES
  ('pro', 'Announcements', 'announcements', 'Official PRO updates.', 0),
  ('pro', 'Wins & Case Studies', 'wins', 'Share results and what''s working.', 1),
  ('pro', 'Ask & Assist', 'ask-assist', 'Questions and help for PRO members.', 2)
ON CONFLICT (space, slug) DO NOTHING;
