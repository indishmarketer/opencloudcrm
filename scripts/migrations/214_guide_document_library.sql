-- Free guides are downloadable documents, not public content pages. Preserve
-- existing IDs so historical activities and pending verification tokens keep
-- working, while removing the page-specific fields from the old model.
ALTER TABLE lead_magnets RENAME TO guide_documents;

ALTER TABLE guide_documents
  ADD COLUMN file_name text,
  ADD COLUMN file_size bigint,
  ADD COLUMN mime_type text,
  ADD COLUMN is_active boolean NOT NULL DEFAULT false;

-- Empty seeded examples have no document to manage and should not appear in
-- the new library. Real uploads keep their title, public URL and ID.
DELETE FROM guide_documents WHERE NULLIF(trim(file_url), '') IS NULL;

UPDATE guide_documents
SET file_name = COALESCE(NULLIF(regexp_replace(split_part(file_url, '?', 1), '^.*/', ''), ''), title || '.pdf'),
    mime_type = 'application/pdf';

-- If older data contains several published rows, select only the newest one
-- for the homepage popup before adding the one-active-document constraint.
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at DESC, id DESC) AS position
  FROM guide_documents
  WHERE published = true
)
UPDATE guide_documents AS document
SET is_active = ranked.position = 1
FROM ranked
WHERE document.id = ranked.id;

ALTER TABLE guide_documents
  ALTER COLUMN file_name SET NOT NULL,
  ALTER COLUMN mime_type SET NOT NULL,
  DROP COLUMN slug,
  DROP COLUMN headline,
  DROP COLUMN subheadline,
  DROP COLUMN cover_image_url,
  DROP COLUMN published;

CREATE UNIQUE INDEX guide_documents_one_active_idx
  ON guide_documents (is_active)
  WHERE is_active = true;
