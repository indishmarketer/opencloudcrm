-- A contact record only had one name field and no address, so a form that
-- asked for "First name" / "Last name" separately, or for a postal address,
-- had nowhere to put the answers -- they could only ever become loose extra
-- details. These are the remaining fields a contact is actually expected to
-- have, so they become real columns and show on the contact's own page
-- alongside email, phone and country.
--
-- Additive and nullable: every existing contact is untouched, and `name`
-- stays the canonical display name (the two halves are kept in step with it
-- by the application -- see extractContactData in src/lib/formsShape.ts).

BEGIN;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address TEXT;

COMMENT ON COLUMN contacts.name IS
  'Canonical display name. first_name/last_name are the same name split, kept in step with it; prefer name for display.';

-- Backfill the two halves from the single name already on file, so the new
-- fields are not blank on every existing contact. Only a plain "First Last"
-- is split; anything longer keeps its whole value as the first name rather
-- than guessing where a multi-part surname begins.
UPDATE contacts
SET first_name = split_part(trim(name), ' ', 1),
    last_name  = NULLIF(substr(trim(name), strpos(trim(name), ' ') + 1), trim(name))
WHERE name IS NOT NULL
  AND trim(name) <> ''
  AND first_name IS NULL
  AND last_name IS NULL;

-- Separate from the contact columns above, but part of the same change: the
-- thank-you confirmation is now shown as a popup and can carry an image
-- (uploaded through the media library like every other console image).
ALTER TABLE forms ADD COLUMN IF NOT EXISTS success_image TEXT NOT NULL DEFAULT '';

COMMIT;
