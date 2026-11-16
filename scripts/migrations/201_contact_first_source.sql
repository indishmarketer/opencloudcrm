-- Where each contact first came from. contacts.source used to hold only
-- 'synced' (the default) plus a few special cases, so most contacts showed
-- no origin in the console. It now records the first real way a person
-- arrived (src/lib/contacts.ts ensureContact `source`), with an optional
-- human detail such as the form or guide name. 'synced' and 'email' (only
-- ever received an email from us) are weak and get replaced by the first
-- real source that comes along.
BEGIN;

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_source_check CHECK (source ~ '^[a-z_]{1,40}$');
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_detail TEXT;

-- Backfill from each contact's earliest recorded activity.
WITH first_activity AS (
  SELECT DISTINCT ON (contact_id) contact_id, source, metadata
  FROM contact_activities
  ORDER BY contact_id, occurred_at, id
), mapped AS (
  SELECT contact_id,
    CASE
      WHEN source IN ('users', 'signup') THEN 'account'
      WHEN source IN ('newsletter_subscribers', 'newsletter') THEN 'newsletter'
      WHEN source IN ('contact_submissions', 'contact_form') THEN 'contact_form'
      WHEN source IN ('form_submissions', 'custom_form') THEN 'form'
      WHEN source IN ('lead_magnets', 'guide') THEN 'guide'
      WHEN source LIKE 'meeting%' THEN 'meeting'
      WHEN source LIKE 'webinar%' THEN 'webinar'
      WHEN source IN ('course_enrollments', 'courses') THEN 'course'
      WHEN source = 'directory_tools' THEN 'tool_submission'
      WHEN source = 'author_applications' THEN 'author'
      WHEN source IN ('payment_claims', 'razorpay_failed_payments') THEN 'payment'
      WHEN source = 'review_submissions' THEN 'review'
      WHEN source = 'forum_posts' THEN 'community'
      ELSE NULL
    END AS new_source,
    NULLIF(metadata->>'label', '') AS detail
  FROM first_activity
)
UPDATE contacts c SET source = m.new_source, source_detail = COALESCE(c.source_detail, m.detail)
FROM mapped m
WHERE c.id = m.contact_id AND c.source = 'synced' AND m.new_source IS NOT NULL;

UPDATE contacts SET source = 'account' WHERE source = 'synced' AND user_id IS NOT NULL;
UPDATE contacts c SET source = 'newsletter' WHERE c.source = 'synced'
  AND EXISTS (SELECT 1 FROM newsletter_subscribers ns WHERE lower(trim(ns.email)) = c.normalized_email);
UPDATE contacts c SET source = 'contact_form' WHERE c.source = 'synced'
  AND EXISTS (SELECT 1 FROM contact_submissions cs WHERE lower(trim(cs.email)) = c.normalized_email);
UPDATE contacts c SET source = 'meeting' WHERE c.source = 'synced'
  AND EXISTS (SELECT 1 FROM meeting_bookings mb WHERE mb.contact_id = c.id);
UPDATE contacts c SET source = 'email' WHERE c.source = 'synced'
  AND EXISTS (SELECT 1 FROM email_deliveries ed WHERE ed.contact_id = c.id);

COMMIT;
