-- Converts every meeting-booking notification email into a normal,
-- deletable/editable concern. The existing meeting.booked webhook event
-- still fires independently, so a self-hoster can build their own
-- replacement automation. Code-side getEmailTemplate() calls for all
-- meeting-* keys (src/lib/meetingEmails.ts's shared deliverTemplate) were
-- changed to getEmailTemplateOptional(), which skips the send instead of
-- throwing once a row is gone -- booking, cancelling, and rescheduling via
-- Cal.com all keep working regardless.

BEGIN;

DELETE FROM email_templates WHERE key IN (
  'meeting-confirmation',
  'meeting-unrecognized-type-alert',
  'meeting-reconciliation-orphan-alert',
  'meeting-owner-new-booking',
  'meeting-cancelled',
  'meeting-owner-cancelled-notice',
  'meeting-owner-rescheduled-notice',
  'meeting-rescheduled',
  'meeting-reminder-24h',
  'meeting-reminder-1h',
  'meeting-no-show-recovery',
  'meeting-follow-up'
);

COMMIT;
