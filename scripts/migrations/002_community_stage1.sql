-- Community forum, Stage 1: schema + General forum core.
-- Safe to re-run: every statement is IF NOT EXISTS / additive.

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','moderator'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS community_points INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS community_categories (
  id SERIAL PRIMARY KEY,
  space TEXT NOT NULL CHECK (space IN ('general','pro')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (space, slug)
);

CREATE TABLE IF NOT EXISTS forum_posts (
  id SERIAL PRIMARY KEY,
  space TEXT NOT NULL CHECK (space IN ('general','pro')),
  category_id INTEGER REFERENCES community_categories(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS forum_comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id INTEGER REFERENCES forum_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_settings (
  id SERIAL PRIMARY KEY,
  space TEXT NOT NULL UNIQUE CHECK (space IN ('general','pro')),
  auto_approve_posts BOOLEAN NOT NULL DEFAULT true,
  auto_approve_comments BOOLEAN NOT NULL DEFAULT true,
  about_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

INSERT INTO community_settings (space, about_text)
VALUES
  ('general', 'A free, public space to ask questions, share wins, and meet other members of the Indish Marketer community.'),
  ('pro', 'The PRO community, for paying members: deeper discussions, direct access, and priority support.')
ON CONFLICT (space) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_forum_posts_space_status ON forum_posts(space, status);
CREATE INDEX IF NOT EXISTS idx_forum_posts_category ON forum_posts(category_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_user ON forum_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_comments_post ON forum_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);

INSERT INTO community_categories (space, name, slug, description, position) VALUES
  ('general', 'General', 'general', 'General discussion.', 0),
  ('general', 'Announcements', 'announcements', 'Official updates.', 1),
  ('general', 'Meet & Greet', 'meet-greet', 'Introduce yourself.', 2),
  ('general', 'Ask & Assist', 'ask-assist', 'Questions and help from the community.', 3)
ON CONFLICT (space, slug) DO NOTHING;
