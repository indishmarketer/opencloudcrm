-- Folders in the email library. The Templates page had two flat lists,
-- and the transactional one is now long enough that finding a course
-- email means reading the whole thing.
--
-- The fixed templates already carry a usable grouping in
-- email_templates.category ('courses', 'meetings', 'admin', 'security',
-- 'account'), so they need no column: the page groups on what is there.
-- Only the owner-authored content templates had nowhere to record a
-- folder, since their own `category` column is the marketing versus
-- transactional tab and is already spoken for.
ALTER TABLE email_content_templates
  ADD COLUMN IF NOT EXISTS folder text;

COMMENT ON COLUMN email_content_templates.folder IS
  'Optional grouping shown on the Templates page. NULL sits in General.';

-- Index the lookup the page does, not the column on its own: it always
-- reads folders within one tab.
CREATE INDEX IF NOT EXISTS idx_email_content_templates_folder
  ON email_content_templates (category, folder);
