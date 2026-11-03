BEGIN;

-- No code path ever set contacts.marketing_status = 'subscribed', and no
-- code path ever reversed a 'bounced'/'invalid' deliverability_status once
-- set (verified by grepping the whole codebase before writing this) -- so
-- every real, verified newsletter subscriber sat at 'unknown' forever, and
-- a single stale/misclassified bounce locked a contact out of all
-- marketing-adjacent email permanently even after they proved their inbox
-- works. Both are now fixed going forward in src/lib/contacts.ts
-- (confirmContactSubscribed, confirmContactDeliverable), wired into the
-- newsletter double opt-in, OTP verification, and account email
-- verification flows. This migration backfills the existing data.

-- 1) Promote contacts who already completed newsletter double opt-in and
-- have not unsubscribed. Spam complaints are left untouched (need a human
-- look, not just a resend of the same form).
WITH verified_subscribers AS (
  SELECT DISTINCT lower(trim(email)) AS normalized_email
  FROM newsletter_subscribers
  WHERE verified = true AND unsubscribed_at IS NULL
)
UPDATE contacts c
SET marketing_status = 'subscribed',
    deliverability_status = CASE WHEN c.deliverability_status = 'complained' THEN c.deliverability_status ELSE 'ok' END,
    updated_at = now()
FROM verified_subscribers v
WHERE c.normalized_email = v.normalized_email
  AND c.marketing_status <> 'unsubscribed';

-- 2) Reset deliverability for contacts tied to an already email-verified
-- account. A verified account proves the address received and the owner
-- clicked a real email from us -- a 'bounced'/'invalid' status on that
-- contact is almost certainly stale. Spam complaints and deliberate
-- unsubscribes are left untouched; those are a choice, not a mailbox-health
-- signal, and any address that's genuinely bad again will simply get
-- re-marked bounced by the next real provider event.
UPDATE contacts c
SET deliverability_status = 'ok', updated_at = now()
FROM users u
WHERE c.user_id = u.id
  AND u.email_verified_at IS NOT NULL
  AND c.deliverability_status IN ('bounced', 'invalid');

-- 3) Drop now-stale suppression-list entries for anyone the above just
-- brought back to fully sendable (subscribed + ok). Without this, sendEmail()
-- would keep silently skipping them even though contacts now says they're fine.
DELETE FROM email_suppressions es
USING contacts c
WHERE es.email = c.normalized_email
  AND c.marketing_status = 'subscribed'
  AND c.deliverability_status = 'ok';

COMMIT;
