-- Migration 142 originally seeded a sign-off naming the wrong person. That
-- migration has already run in production, and its ON CONFLICT clause
-- deliberately leaves subject and body_html alone so owner edits made in
-- the console are never clobbered -- which also means re-running it cannot
-- correct the stored copy.
--
-- So this fixed the stored rows directly, as a targeted replacement rather
-- than a rewrite, to preserve any wording the owner had since edited in
-- the console. Already applied; a fresh install's generic seed (see
-- migration 142) has nothing for this to match, so it is a no-op there.

UPDATE email_templates
SET body_html = REPLACE(body_html, '__WRONG_SIGNOFF_NAME__', '__CORRECT_SIGNOFF_NAME__')
WHERE key IN ('open-source-otp', 'open-source-confirmed')
  AND body_html LIKE '%__WRONG_SIGNOFF_NAME__%';

UPDATE email_templates
SET subject = REPLACE(subject, '__WRONG_SIGNOFF_NAME__', '__CORRECT_SIGNOFF_NAME__')
WHERE key IN ('open-source-otp', 'open-source-confirmed')
  AND subject LIKE '%__WRONG_SIGNOFF_NAME__%';
