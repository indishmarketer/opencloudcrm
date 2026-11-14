-- Gives every email_content_templates row a category so the console's
-- Templates page can show one unified list with Marketing/Transactional
-- tabs instead of a separate "fixed emails" section. Existing rows default
-- to 'marketing' -- they were all written for campaigns/one-off sends
-- before this column existed.
BEGIN;

ALTER TABLE email_content_templates
  ADD COLUMN category TEXT NOT NULL DEFAULT 'marketing'
  CHECK (category IN ('marketing', 'transactional'));

COMMIT;
