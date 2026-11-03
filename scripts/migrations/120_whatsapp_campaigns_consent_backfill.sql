-- WhatsApp: real opt-in for existing accounts, campaigns, and the fields
-- every report needs.
--
-- Three things, in order:
--
-- 1. The consent machinery added in 118 defaulted everyone to 'unknown',
--    which blocked marketing for every contact because nothing had ever
--    asked for WhatsApp consent. The owner's decision (2026-10-22): every
--    contact who already has an account on the site counts as subscribed,
--    and from now on both the email and the WhatsApp checkbox are asked
--    for explicitly at signup/booking/registration. Source 'backfill'
--    records that this one came from that decision rather than from
--    someone ticking a box, so it can be told apart later.
--    An existing 'unsubscribed' is never touched.
UPDATE contacts
SET whatsapp_status = 'subscribed',
    whatsapp_status_source = 'backfill',
    whatsapp_status_at = now(),
    updated_at = now()
WHERE user_id IS NOT NULL
  AND whatsapp_status = 'unknown';

-- 1b. The WhatsApp checkbox's answer at signup, held here until the email
--     is verified -- exactly how `updates_opt_in` already works, so that a
--     mistyped or someone-else's address cannot opt a real person in. The
--     default is false because an account created before the checkbox
--     existed never answered it; those are handled by the backfill above.
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false;

-- 2. Campaigns: one approved template sent to a consent-filtered segment.
--    Queued per recipient exactly like newsletter_sends (migration 033) so
--    a batch goes out on click and the five-minute dispatcher finishes the
--    rest; claimed_at + attempts make a crashed batch safe to retry.
CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  -- The template's Meta category when the campaign was created. Stored
  -- because Meta re-categorises templates, and a campaign's consent rules
  -- have to follow what it actually was at send time.
  category TEXT,
  -- One entry per {{n}} in the template body, in order.
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Media templates need a public URL per send; null for text-only ones.
  header_media_url TEXT,
  -- The variable suffix for a dynamic URL button, if the template has one,
  -- with that button position in the template buttons array: Meta
  -- identifies the button to fill by index, and a template can have a
  -- quick reply ahead of the link button, so it is not always 0.
  button_url_param TEXT,
  button_url_index INTEGER,
  segment_id INTEGER REFERENCES contact_segments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sending', 'sent', 'completed_with_errors')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS whatsapp_campaign_sends (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  contact_id BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  -- The number as it was at queue time: a contact can change their number
  -- mid-send, and the report has to say where the message actually went.
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  wa_message_id TEXT,
  skipped_reason TEXT,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One send per contact per campaign, so re-queuing a campaign cannot
-- message the same person twice.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_campaign_sends_uniq
  ON whatsapp_campaign_sends (campaign_id, contact_id);
CREATE INDEX IF NOT EXISTS whatsapp_campaign_sends_pending_idx
  ON whatsapp_campaign_sends (status) WHERE status = 'pending';

-- 3. What a message was, so delivery/read rates can be reported per
--    template and per campaign. Until now a row recorded only the rendered
--    one-line summary, which cannot be grouped by anything.
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS template_name TEXT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS campaign_id INTEGER
  REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL;
-- Meta's own id for the person. Today it equals their phone number, but
-- usernames and Business Scoped User IDs are rolling out, after which the
-- number stops being the identity. Stored separately now so conversations
-- are not permanently keyed on a phone number.
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS wa_user_id TEXT;
-- What Meta says it charged for: 'utility', 'marketing', 'authentication',
-- 'service', plus whether it was billable at all. Taken from the status
-- webhook; this is Meta's own classification, not ours.
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS pricing_category TEXT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS billable BOOLEAN;

CREATE INDEX IF NOT EXISTS whatsapp_messages_template_idx
  ON whatsapp_messages (template_name, created_at DESC) WHERE template_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_messages_campaign_idx
  ON whatsapp_messages (campaign_id) WHERE campaign_id IS NOT NULL;

-- Our own grouping for the template list (Bookings, Courses, Newsletter).
-- Meta has no concept of this; the name is the key because that is what
-- every send refers to.
CREATE TABLE IF NOT EXISTS whatsapp_template_labels (
  template_name TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
