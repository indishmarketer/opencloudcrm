-- Converts the contact-form notification emails into a normal,
-- deletable/editable concern. The existing contact_form.submitted webhook
-- event (src/lib/otpCompletion.ts) already fires independently, so a
-- self-hoster can build their own replacement automation. Code-side
-- getEmailTemplate() calls for these two keys were changed to
-- getEmailTemplateOptional(), which skips the send instead of throwing
-- once the row is gone.
--
-- 'contact-form-reply' is deliberately NOT included: it is not a
-- notification template, it's the delivery envelope for an admin-typed
-- reply (arbitrary text, not an automation), so it stays fixed.

BEGIN;

DELETE FROM email_templates WHERE key IN (
  'contact-form-admin-notify',
  'contact-form-received'
);

COMMIT;
