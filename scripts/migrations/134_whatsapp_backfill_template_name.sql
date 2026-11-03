-- WhatsApp: backfill template_name for outbound template sends that were
-- recorded before the template_name column existed (added in migration 120).
-- Those rows still hold the template name inside the stored request payload,
-- so the reports (which group by template_name) missed them even though the
-- message itself was sent and delivered.
UPDATE whatsapp_messages
SET template_name = raw->'request'->'template'->>'name'
WHERE direction = 'outbound'
  AND template_name IS NULL
  AND raw->'request'->'template'->>'name' IS NOT NULL;
