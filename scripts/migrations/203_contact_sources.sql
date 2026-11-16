-- A contact can carry several sources, in the order they arrived: e.g.
-- "Account" (anyone who creates an account, however they sign up) plus the
-- page they came from before signing up ("Directory", a blog post's
-- label...). Each keeps the page path it came from so the console can link
-- to it. Labels are the owner's own (page_sources), except "Account".
-- Supersedes contacts.source_detail as what the console shows.
BEGIN;

CREATE TABLE IF NOT EXISTS contact_sources (
  id BIGSERIAL PRIMARY KEY,
  contact_id BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  path TEXT CHECK (path IS NULL OR path ~ '^/'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_sources_one_label ON contact_sources (contact_id, lower(label));

INSERT INTO contact_sources (contact_id, label, path, created_at)
SELECT c.id, 'Account', '/signup', COALESCE(u.created_at, c.first_seen_at)
FROM contacts c JOIN users u ON u.id = c.user_id
ON CONFLICT DO NOTHING;

INSERT INTO contact_sources (contact_id, label, path, created_at)
SELECT c.id, left(c.source_detail, 40),
  (SELECT ps.path FROM page_sources ps WHERE lower(ps.label) = lower(c.source_detail) ORDER BY ps.path LIMIT 1),
  c.first_seen_at
FROM contacts c
WHERE c.source_detail IS NOT NULL AND btrim(c.source_detail) <> ''
ON CONFLICT DO NOTHING;

COMMIT;
