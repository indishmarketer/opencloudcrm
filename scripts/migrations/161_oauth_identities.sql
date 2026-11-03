-- Links a users row to a third-party SSO identity (Google/GitHub/LinkedIn
-- sign-in). One user can link at most one identity per provider; a given
-- provider account can only ever map to one user (both enforced below).
CREATE TABLE oauth_identities (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'github', 'linkedin')),
  provider_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)
);
