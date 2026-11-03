-- Each contact's country (ISO 3166-1 alpha-2), so checkout shows the right
-- currency and payment method even when the buyer is on a VPN, and so the
-- audience can be segmented by country.
--
-- country_source decides what may overwrite it:
--   'ip'    guessed from Cloudflare's cf-ipcountry; anything replaces it
--   'form'  picked on a signup/booking/newsletter/contact form; only fills
--           an empty or IP-guessed value (the picker is prefilled, so a VPN
--           could otherwise silently overwrite a real answer)
--   'self'  the person changed it in account settings or at checkout
--   'owner' set by the owner in the console
-- 'self' and 'owner' are deliberate edits: the latest one wins.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS country TEXT
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS country_source TEXT
  CHECK (country_source IS NULL OR country_source IN ('ip', 'form', 'self', 'owner'));
CREATE INDEX IF NOT EXISTS idx_contacts_country ON contacts (country) WHERE country IS NOT NULL;
