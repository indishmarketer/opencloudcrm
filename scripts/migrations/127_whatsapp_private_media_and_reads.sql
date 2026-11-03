-- Conversation media moved to a private bucket (im-whatsapp-media, no
-- public access). A row now holds the object key rather than a public URL:
-- there is no URL for it that works without being signed first.
--
-- media_url stays for what legitimately is public: a template's approved
-- header sample, and the files stored before this change.
--
-- Additive on purpose, so it can run before the deploy. The companion
-- change to whatsapp_conversation_reads is migration 128, which must run
-- after it.
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS media_key TEXT;

CREATE INDEX IF NOT EXISTS whatsapp_messages_media_key_idx
  ON whatsapp_messages (media_key) WHERE media_key IS NOT NULL;
