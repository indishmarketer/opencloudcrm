-- Converts webinar notification emails into a normal, deletable/editable
-- concern. The new webinar.registered webhook event (see
-- webhookEventCatalogue.ts, emitted from src/app/api/webinars/register/route.ts)
-- lets a self-hoster build their own replacement automation. Code-side
-- getEmailTemplate() calls for these keys were changed to
-- getEmailTemplateOptional() (src/lib/webinarEmails.ts), which skips the
-- send instead of throwing once the row is gone -- the webinar still
-- registers, plays, and reminds on schedule either way.
--
-- 'webinar-guest-signin' is deliberately NOT included here: it is not a
-- notification, it is the one-time sign-in link that is the guest's only
-- way into their account (no password exists for a guest signup), making
-- it architecturally the same as magic-link-login/email-verification --
-- kept alongside those under Account & security.

BEGIN;

DELETE FROM email_templates WHERE key IN (
  'webinar-registration-confirmation',
  'webinar-reminder-24h',
  'webinar-reminder-1h',
  'webinar-follow-up',
  'webinar-question-owner-alert',
  'webinar-processing-failed-alert',
  'webinar-question-answered'
);

COMMIT;
