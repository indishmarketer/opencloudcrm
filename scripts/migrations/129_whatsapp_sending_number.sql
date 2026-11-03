-- Which of the account's numbers sends, choosable from the console instead
-- of being pinned to the WHATSAPP_PHONE_NUMBER_ID env var (which needed a
-- redeploy to change). Absent means "use the env var", so this is additive
-- and safe to run before the deploy.
--
-- Also records which of our numbers each message belongs to. Meta ties the
-- 24-hour reply window to the pair of (our number, their number), so once a
-- second number is in use a reply has to go out from the number that
-- received the message, not from whichever one happens to be the default.
-- NULL means the message predates this and belongs to the default number.
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS business_phone_number_id TEXT;

CREATE INDEX IF NOT EXISTS whatsapp_messages_business_number_idx
  ON whatsapp_messages (business_phone_number_id) WHERE business_phone_number_id IS NOT NULL;
