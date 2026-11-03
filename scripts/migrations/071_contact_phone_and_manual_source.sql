-- Phone number field for contacts (didn't exist before -- needed for manual
-- contact creation and CSV import mapping), plus a source marker so
-- manually-created/imported contacts are distinguishable from ones synced
-- from an existing table (users/newsletter_subscribers/etc).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'synced'
  CHECK (source IN ('synced', 'manual', 'import'));
