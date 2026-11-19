-- Put the owner's profile photo back on the byline and the booking page.
--
-- blog_authors.avatar_url pointed at author/shubho-dey.webp, which is not
-- in the bucket: images.indishmarketer.com returns 404 for it. Both the
-- blog byline and the "with <host>" badge on /book/<slug> render the
-- image only when a URL exists, so a URL that exists but 404s left a
-- blank circle on every post and every booking page.
--
-- The replacement is a 512 square crop of the About page portrait, which
-- is the same photo and is already in the bucket, uploaded through the
-- media library so it carries a key that is actually present.
--
-- Scoped to the dead path on purpose: an author whose photo is fine, or
-- who has none at all, is left alone.

BEGIN;

UPDATE blog_authors
SET avatar_url = 'https://images.indishmarketer.com/author/3ce9a700-457d-45b7-aaf8-b87794d9037f.webp',
    updated_at = now()
WHERE slug = 'shubho-dey'
  AND (avatar_url IS NULL OR avatar_url LIKE '%author/shubho-dey.webp');

COMMIT;
