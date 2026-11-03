BEGIN;

-- Owner's explicit call: every contact currently in the table (post-cleanup
-- of the two bounced junk signups) is a legitimate marketing contact by
-- default, including the owner's own address. Does not touch anyone who
-- has since explicitly unsubscribed or complained -- those stay as-is.
UPDATE contacts
SET marketing_status = 'subscribed', updated_at = now()
WHERE marketing_status NOT IN ('unsubscribed');

UPDATE contacts
SET deliverability_status = 'ok', updated_at = now()
WHERE deliverability_status NOT IN ('suppressed', 'complained');

DELETE FROM email_suppressions es
USING contacts c
WHERE es.email = c.normalized_email
  AND c.marketing_status = 'subscribed'
  AND c.deliverability_status = 'ok';

COMMIT;
