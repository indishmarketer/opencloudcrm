-- The retired Open Source waitlist contacts were all collected for Open Cloud
-- CRM. Preserve their timeline while exposing them as ordinary webhook leads.
BEGIN;

DELETE FROM email_templates WHERE key IN ('open-source-otp', 'open-source-confirmed');

INSERT INTO contact_activities
  (contact_id, activity_type, source, source_record_id, metadata, occurred_at)
SELECT contact_id, 'webhook_lead', 'open-cloud-crm', source_record_id, metadata, occurred_at
FROM contact_activities
WHERE activity_type = 'open_source_waitlist'
ON CONFLICT (source, source_record_id, activity_type) DO UPDATE SET
  contact_id = EXCLUDED.contact_id,
  metadata = EXCLUDED.metadata,
  occurred_at = GREATEST(contact_activities.occurred_at, EXCLUDED.occurred_at);

DELETE FROM contact_activities WHERE activity_type = 'open_source_waitlist';

INSERT INTO contact_activities
  (contact_id, activity_type, source, source_record_id, metadata, occurred_at)
SELECT c.id, 'webhook_lead', 'open-cloud-crm', 'legacy-contact:' || c.id::text,
       jsonb_build_object('email', c.email, 'name', c.name), c.first_seen_at
FROM contacts c
WHERE c.source = 'open_source'
  AND NOT EXISTS (
    SELECT 1 FROM contact_activities ca
    WHERE ca.contact_id = c.id AND ca.activity_type = 'webhook_lead'
  )
ON CONFLICT (source, source_record_id, activity_type) DO NOTHING;

UPDATE contacts SET source = 'synced', updated_at = now() WHERE source = 'open_source';

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_source_check
  CHECK (source = ANY (ARRAY['synced', 'manual', 'import', 'guide']));

COMMIT;
