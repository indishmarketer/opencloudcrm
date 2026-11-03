-- WhatsApp Business API message log: every inbound message and outbound
-- send/status update is recorded here, both for debugging the webhook and
-- as the data source for a future console inbox. Raw payload is always
-- kept so nothing is lost even if our parsing of a given message type is
-- incomplete.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id SERIAL PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  wa_message_id TEXT,
  from_number TEXT,
  to_number TEXT,
  message_type TEXT,
  body TEXT,
  status TEXT,
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_wa_message_id_idx ON whatsapp_messages (wa_message_id);
CREATE INDEX IF NOT EXISTS whatsapp_messages_created_at_idx ON whatsapp_messages (created_at DESC);
