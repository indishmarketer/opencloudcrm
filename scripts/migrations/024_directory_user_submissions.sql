-- Lets a logged-in user submit their own tool to the directory (lands
-- pending, same review flow as API submissions). Tracks who submitted it
-- so the account/submission relationship is synced like everything else
-- (reviews, community posts).
ALTER TABLE directory_tools ADD COLUMN IF NOT EXISTS submitted_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE directory_tools DROP CONSTRAINT IF EXISTS directory_tools_source_check;
ALTER TABLE directory_tools ADD CONSTRAINT directory_tools_source_check CHECK (source IN ('manual', 'api', 'user'));
