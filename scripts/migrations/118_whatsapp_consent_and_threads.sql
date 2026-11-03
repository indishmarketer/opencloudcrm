-- WhatsApp consent on the contact, and a link from each message to it.
--
-- Consent is tracked separately from `marketing_status` because that column
-- is about email: someone can want order updates by email and nothing on
-- WhatsApp, or the reverse. Default 'unknown' is deliberate -- a phone
-- number given at checkout is permission to send service messages about
-- that order, not permission to market, so marketing sends require an
-- explicit 'subscribed' rather than treating silence as a yes.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_status TEXT NOT NULL DEFAULT 'unknown'
  CHECK (whatsapp_status IN ('unknown', 'subscribed', 'unsubscribed'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_status_at TIMESTAMPTZ;
-- Where the consent (or the opt-out) came from: 'signup', 'booking',
-- 'checkout', 'reply_stop', 'owner'.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_status_source TEXT;

-- Which contact a message belongs to, so a conversation can be read next to
-- the person's purchases and bookings instead of as a loose phone number.
-- Nullable: messages from numbers we have never seen still get recorded.
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS contact_id BIGINT
  REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whatsapp_messages_contact_idx
  ON whatsapp_messages (contact_id, created_at DESC);

-- Phone lookups happen on every inbound message and every send.
CREATE INDEX IF NOT EXISTS contacts_phone_idx ON contacts (phone) WHERE phone IS NOT NULL;
