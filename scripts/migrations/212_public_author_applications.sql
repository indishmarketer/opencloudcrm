-- Let writers apply and continue the editorial workflow without creating
-- an account. The access token is a bearer secret used only in emailed
-- status and submission links. Uploaded documents stay behind application
-- or admin authorization instead of being linked from the public bucket.

BEGIN;

ALTER TABLE author_applications ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS applicant_name TEXT;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS applicant_email TEXT;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS sample_text TEXT;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS sample_file_key TEXT;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS sample_file_name TEXT;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS sample_file_type TEXT;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS sample_file_size INTEGER;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS submission_file_key TEXT;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS submission_file_name TEXT;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS submission_file_type TEXT;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS submission_file_size INTEGER;

UPDATE author_applications aa
SET applicant_name = COALESCE(aa.applicant_name, u.name),
    applicant_email = COALESCE(aa.applicant_email, u.email)
FROM users u
WHERE aa.user_id = u.id
  AND (aa.applicant_name IS NULL OR aa.applicant_email IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_author_applications_access_token
  ON author_applications(access_token) WHERE access_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_author_applications_applicant_email
  ON author_applications(lower(applicant_email)) WHERE applicant_email IS NOT NULL;

COMMIT;
