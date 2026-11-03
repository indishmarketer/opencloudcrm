-- blog_authors.social_links was free text -- the actual site (AuthorByline,
-- /author/[slug]) renders social links as a structured {label,url}[] list
-- (see src/data/authors.ts), so the console editor needs to produce the
-- same shape, not a text blob. Switch the column to jsonb.
--
-- Deliberately no seeded author row here: this repo is a public,
-- self-hostable product, and the owner's real name/bio/avatar/socials is
-- this deployment's own content, not a generic default. Add your own
-- author at /console/blog/authors after install.

BEGIN;

ALTER TABLE blog_authors ALTER COLUMN social_links DROP DEFAULT;
ALTER TABLE blog_authors ALTER COLUMN social_links TYPE JSONB USING '[]'::jsonb;
ALTER TABLE blog_authors ALTER COLUMN social_links SET DEFAULT '[]'::jsonb;

COMMIT;
