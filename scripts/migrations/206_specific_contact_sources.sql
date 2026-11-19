-- Contact sources could not answer "which page did this person come from?".
--
-- Two separate causes, both fixed here:
--
-- 1. "Website" was the label for the home page AND the silent fallback for
--    any path that matched no known section (hardcodedPageSource ended in
--    `return "Website"`, and an uncaptured path defaulted to "/"). So a
--    genuine home-page signup, a signup on an unrecognised landing page, and
--    a signup whose page was never recorded all collapsed into one word that
--    says nothing. Every such row already stores the exact path it came
--    from, so the real label is recoverable from the row itself.
--
-- 2. Contacts with no contact_sources row at all show "Unknown", even though
--    their first-touch attribution_events row still holds the landing page
--    that brought them in.
--
-- Section mapping below mirrors hardcodedPageSource() in
-- src/lib/pageSourcesShape.ts. Keep the two in step.

BEGIN;

-- 1. Re-label "Website" from the path each row already carries. ----------

WITH mapped AS (
  SELECT cs.id, cs.contact_id,
    left(CASE
      WHEN cs.path IS NULL OR cs.path = '/' THEN 'Home page'
      WHEN cs.path ~ '^/blog(/|$)' THEN 'Blog'
      WHEN cs.path ~ '^/courses?(/|$)' THEN 'Course'
      WHEN cs.path ~ '^/webinars?(/|$)' THEN 'Webinar'
      WHEN cs.path ~ '^/book(/|$)' THEN 'Meeting booking'
      WHEN cs.path ~ '^/newsletter(/|$)' THEN 'Newsletter'
      WHEN cs.path ~ '^/contact(/|$)' THEN 'Contact page'
      WHEN cs.path ~ '^/(guide|guides|resources)(/|$)' THEN 'Free guide'
      WHEN cs.path ~ '^/(directory|tools)(/|$)' THEN 'Tools directory'
      WHEN cs.path ~ '^/community(/|$)' THEN 'Community'
      WHEN cs.path ~ '^/reviews?(/|$)' THEN 'Reviews'
      WHEN cs.path ~ '^/(signup|auth)(/|$)' THEN 'Account'
      -- First path segment, de-slugged: "/free-guide/x" -> "Free guide".
      -- COALESCE floor keeps this non-empty so the DELETE below can treat
      -- "still called Website" as meaning "duplicate", nothing else.
      ELSE COALESCE(NULLIF(initcap(replace(split_part(btrim(cs.path, '/'), '/', 1), '-', ' ')), ''), 'Home page')
    END, 40) AS new_label
  FROM contact_sources cs
  WHERE lower(cs.label) = 'website'
),
updatable AS (
  -- The unique index on (contact_id, lower(label)) would reject a rename
  -- onto a label the contact already has, and such a row would only repeat
  -- what is already displayed. Left alone here, removed just below.
  SELECT m.id, m.new_label
  FROM mapped m
  WHERE NOT EXISTS (
    SELECT 1 FROM contact_sources o
    WHERE o.contact_id = m.contact_id
      AND o.id <> m.id
      AND lower(o.label) = lower(m.new_label)
  )
)
UPDATE contact_sources cs
SET label = u.new_label
FROM updatable u
WHERE cs.id = u.id;

DELETE FROM contact_sources WHERE lower(label) = 'website';

-- 2. Give sourceless contacts their first-touch landing page. ------------

WITH landing AS (
  SELECT c.id AS contact_id,
    -- landing_page is stored as either a path or a full URL.
    regexp_replace(btrim(ae.landing_page), '^https?://[^/]+', '') AS raw_path,
    ae.created_at
  FROM contacts c
  JOIN attribution_events ae
    ON (c.user_id IS NOT NULL AND ae.user_id = c.user_id)
    OR lower(btrim(COALESCE(ae.email, ''))) = c.normalized_email
  WHERE ae.landing_page IS NOT NULL
    AND btrim(ae.landing_page) <> ''
    AND NOT EXISTS (SELECT 1 FROM contact_sources cs WHERE cs.contact_id = c.id)
),
first_touch AS (
  SELECT DISTINCT ON (contact_id) contact_id,
    CASE WHEN raw_path ~ '^/' THEN left(split_part(raw_path, '?', 1), 300) ELSE '/' END AS path,
    created_at
  FROM landing
  ORDER BY contact_id, created_at ASC
)
INSERT INTO contact_sources (contact_id, label, path, created_at)
SELECT ft.contact_id,
  left(CASE
    WHEN ft.path = '/' THEN 'Home page'
    WHEN ft.path ~ '^/blog(/|$)' THEN 'Blog'
    WHEN ft.path ~ '^/courses?(/|$)' THEN 'Course'
    WHEN ft.path ~ '^/webinars?(/|$)' THEN 'Webinar'
    WHEN ft.path ~ '^/book(/|$)' THEN 'Meeting booking'
    WHEN ft.path ~ '^/newsletter(/|$)' THEN 'Newsletter'
    WHEN ft.path ~ '^/contact(/|$)' THEN 'Contact page'
    WHEN ft.path ~ '^/(guide|guides|resources)(/|$)' THEN 'Free guide'
    WHEN ft.path ~ '^/(directory|tools)(/|$)' THEN 'Tools directory'
    WHEN ft.path ~ '^/community(/|$)' THEN 'Community'
    WHEN ft.path ~ '^/reviews?(/|$)' THEN 'Reviews'
    WHEN ft.path ~ '^/(signup|auth)(/|$)' THEN 'Account'
    ELSE COALESCE(NULLIF(initcap(replace(split_part(btrim(ft.path, '/'), '/', 1), '-', ' ')), ''), 'Home page')
  END, 40),
  ft.path,
  ft.created_at
FROM first_touch ft
ON CONFLICT DO NOTHING;

COMMIT;
