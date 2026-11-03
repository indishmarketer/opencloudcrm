-- Transforms every existing "contactForm"/"newsletter" page-builder block
-- into the new, generic "form" block (mode: "contact" | "newsletter") added
-- in src/lib/pageBlocks.ts. Structural/type transform only -- no business
-- content is introduced by this file, consistent with CLAUDE.md.
--
-- Both the working-copy column (`blocks`, a bare JSONB array) and the
-- published-snapshot column (`published`, a JSONB object with its own
-- nested `blocks` array -- see snapshotOf() in src/lib/sitePages.ts) get
-- the same transform.
--
-- IMPORTANT DEPLOY ORDER: the application code must already understand the
-- "form" block type (list_page_block_types returns it, the console and the
-- public renderer both handle it) before this migration runs -- otherwise
-- there's a window where a visitor's /contact page briefly renders nothing
-- where the old contactForm block used to be, because the not-yet-deployed
-- server doesn't recognize "form" either way. "contactForm"/"newsletter"
-- stay registered and fully functional in pageBlocks.ts until this has run
-- and been verified live, specifically so that window can't happen by
-- deploying app code and this migration together.
--
-- Idempotent: rows with no contactForm/newsletter block are left untouched,
-- and an already-"form" block passes through the ELSE branch unchanged --
-- though in practice this only ever runs once per database, like every
-- other migration (tracked by filename in schema_migrations).

CREATE OR REPLACE FUNCTION pg_temp.migrate_164_block(elem jsonb) RETURNS jsonb AS $$
  SELECT CASE elem->>'type'
    WHEN 'contactForm' THEN
      jsonb_build_object(
        'id', elem->'id',
        'type', 'form',
        'props', jsonb_strip_nulls(jsonb_build_object(
          'mode', 'contact',
          'heading', elem#>'{props,heading}',
          'text', elem#>'{props,text}',
          'messageLabel', elem#>'{props,messageLabel}',
          'showContactDetails', elem#>'{props,showDetails}',
          'detailsHeading', elem#>'{props,detailsHeading}',
          'successHeading', elem#>'{props,successHeading}',
          'successText', elem#>'{props,successText}',
          'background', elem#>'{props,background}',
          'spacing', elem#>'{props,spacing}',
          'anchor', elem#>'{props,anchor}'
        ))
      )
    WHEN 'newsletter' THEN
      jsonb_build_object(
        'id', elem->'id',
        'type', 'form',
        'props', jsonb_strip_nulls(jsonb_build_object(
          'mode', 'newsletter',
          'heading', elem#>'{props,heading}',
          'text', elem#>'{props,text}',
          'background', elem#>'{props,background}',
          'spacing', elem#>'{props,spacing}',
          'anchor', elem#>'{props,anchor}'
        ))
      )
    ELSE elem
  END;
$$ LANGUAGE sql IMMUTABLE;

UPDATE site_pages
SET blocks = (
  SELECT COALESCE(jsonb_agg(pg_temp.migrate_164_block(elem)), '[]'::jsonb)
  FROM jsonb_array_elements(blocks) AS elem
)
WHERE jsonb_typeof(blocks) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(blocks) e WHERE e->>'type' IN ('contactForm', 'newsletter'));

UPDATE site_pages
SET published = jsonb_set(
  published,
  '{blocks}',
  (
    SELECT COALESCE(jsonb_agg(pg_temp.migrate_164_block(elem)), '[]'::jsonb)
    FROM jsonb_array_elements(published->'blocks') AS elem
  )
)
WHERE published IS NOT NULL
  AND jsonb_typeof(published->'blocks') = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(published->'blocks') e WHERE e->>'type' IN ('contactForm', 'newsletter'));

DROP FUNCTION pg_temp.migrate_164_block(jsonb);
