BEGIN;

-- Root cause of migration 063's deliverability backfill matching 0 rows:
-- ensureContact() is called without a userId from sendEmail() (the most
-- common way a contacts row first gets created -- e.g. a brand new
-- account's own verification email), so most contacts rows never got
-- user_id populated even for people who are fully real, verified account
-- holders. Fixed going forward in src/app/api/auth/signup/route.ts
-- (contacts row now linked at signup, before any email fires). This
-- backfills the existing gap by matching on normalized email.

UPDATE contacts c
SET user_id = u.id, updated_at = now()
FROM users u
WHERE c.user_id IS NULL
  AND c.normalized_email = lower(trim(u.email));

-- Re-run 063's deliverability reset now that the linkage above exists:
-- a verified account proves the address received and the owner clicked a
-- real email from us, so a 'bounced'/'invalid' status on that contact is
-- almost certainly stale. Spam complaints and deliberate unsubscribes are
-- left untouched.
UPDATE contacts c
SET deliverability_status = 'ok', updated_at = now()
FROM users u
WHERE c.user_id = u.id
  AND u.email_verified_at IS NOT NULL
  AND c.deliverability_status IN ('bounced', 'invalid');

DELETE FROM email_suppressions es
USING contacts c
WHERE es.email = c.normalized_email
  AND c.marketing_status = 'subscribed'
  AND c.deliverability_status = 'ok';

COMMIT;
