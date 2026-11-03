-- Keep public R2 media URLs alongside WhatsApp message records so the
-- conversation can render image messages and template image headers.
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_url TEXT;
