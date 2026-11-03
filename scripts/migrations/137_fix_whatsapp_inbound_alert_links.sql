-- The "new WhatsApp message" alert used to link to a bare phone number
-- (e.g. /console/whatsapp/messages/919876543210), but the thread page only
-- accepts a conversation key shaped "c-<contact id>" or "p-<digits>"
-- (parseConversationKey in src/lib/whatsappContacts.ts), so every one of
-- these alerts 404'd when opened. The webhook that raises them is fixed in
-- the same change; this repairs the rows it already wrote.
WITH broken AS (
  SELECT id, split_part(dedupe_key, ':', 2) AS digits
  FROM system_alerts
  WHERE kind = 'whatsapp_inbound'
    AND link ~ '^/console/whatsapp/messages/[0-9]+$'
)
UPDATE system_alerts a
SET link = CASE
  WHEN c.id IS NOT NULL THEN '/console/whatsapp/messages/c-' || c.id
  ELSE '/console/whatsapp/messages/p-' || b.digits
END
FROM broken b
LEFT JOIN contacts c ON regexp_replace(c.phone, '\D', '', 'g') = b.digits
WHERE a.id = b.id;
