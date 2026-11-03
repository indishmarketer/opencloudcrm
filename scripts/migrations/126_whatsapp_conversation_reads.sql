-- When the owner last opened each conversation in the console, so the
-- inbox can show an unread count the way a chat app does. One row per
-- conversation key ('c-62' for a linked contact, 'p-9197...' for a loose
-- number), which is the same key the inbox and thread URLs already use.
--
-- Deliberately not a per-message read flag: what matters is "has anything
-- arrived since I last looked", and a single timestamp answers that
-- without writing a row per message.
CREATE TABLE IF NOT EXISTS whatsapp_conversation_reads (
  conversation_key TEXT PRIMARY KEY,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
