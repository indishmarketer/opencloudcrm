-- Author links now render as platform icons (label = platform name).
-- Habib Hassan: website, YouTube, Instagram (supplied by the owner).
UPDATE blog_authors
SET social_links = '[{"label":"Website","url":"https://repostit.io/"},{"label":"YouTube","url":"https://www.youtube.com/@hhaaaxxx"},{"label":"Instagram","url":"https://www.instagram.com/repostitofficial"}]'::jsonb,
    updated_at = now()
WHERE slug = 'habib-hassan';

-- Owner: add Facebook (from the site footer) next to X, LinkedIn, YouTube.
UPDATE blog_authors
SET social_links = social_links || '[{"label":"Facebook","url":"https://facebook.com/indishmarketer"}]'::jsonb,
    updated_at = now()
WHERE slug = 'shubho-dey' AND NOT (social_links @> '[{"label":"Facebook"}]'::jsonb);
