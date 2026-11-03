-- Makes WhatsApp webhook processing safe to retry.
--
-- The webhook used to answer 200 even when recording an event failed, so
-- Meta never retried and the event was lost for good. It now answers 500 on
-- failure so Meta retries -- which is only safe if replaying the same
-- payload cannot duplicate rows, hence this unique key.
--
-- Scoped per direction because an outbound send and its own status update
-- share a wa_message_id: the send inserts the row, the status webhook
-- updates it.
DELETE FROM whatsapp_messages a
USING whatsapp_messages b
WHERE a.id > b.id
  AND a.wa_message_id IS NOT NULL
  AND a.wa_message_id = b.wa_message_id
  AND a.direction = b.direction;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wa_id_direction_uniq
  ON whatsapp_messages (wa_message_id, direction)
  WHERE wa_message_id IS NOT NULL;
