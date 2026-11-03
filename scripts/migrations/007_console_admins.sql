-- Console admins: invited administrators beyond the one true owner
-- (ADMIN_EMAIL, never stored here, always implicit and un-removable).
-- Safe to re-run: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS console_admins (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  invited_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
