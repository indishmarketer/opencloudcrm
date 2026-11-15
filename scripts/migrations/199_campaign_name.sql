-- A campaign's internal name is independent of the recipient-facing subject.
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS name TEXT;
UPDATE newsletter_campaigns SET name = COALESCE(NULLIF(trim(subject), ''), 'Campaign ' || id)
WHERE name IS NULL OR trim(name) = '';
ALTER TABLE newsletter_campaigns ALTER COLUMN name SET NOT NULL;
