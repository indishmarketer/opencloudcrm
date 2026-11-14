-- Converts payment notification/alert emails into a normal,
-- deletable/editable concern. The existing payment_claim.submitted,
-- payment_claim.resolved, and payment.succeeded webhook events, plus the
-- in-console inbox alerts raiseAlert() already posts for the unmatched/
-- failed-grant cases, keep working either way -- so a self-hoster loses
-- nothing load-bearing by deleting these rows. Code-side getEmailTemplate()
-- calls for these keys were changed to getEmailTemplateOptional().

BEGIN;

DELETE FROM email_templates WHERE key IN (
  'payment-claim-admin-notify',
  'payment-claim-received',
  'razorpay-unmatched-payment-alert',
  'payment-grant-failed-alert'
);

COMMIT;
