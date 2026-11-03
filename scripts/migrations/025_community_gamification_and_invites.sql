-- Community forum, Stage 6: Gamification (Levels & Points) & Invite/Referral tracking

-- 1. Add referred_by to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

-- 2. Create community_invites table
CREATE TABLE IF NOT EXISTS community_invites (
  id SERIAL PRIMARY KEY,
  inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_invites_inviter ON community_invites(inviter_id);
CREATE INDEX IF NOT EXISTS idx_community_invites_invitee ON community_invites(invitee_id);
