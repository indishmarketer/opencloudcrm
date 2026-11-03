BEGIN;

-- The original info@ address was the owner's real personal-inbox
-- forwarding target -- receive-only, never a "From" identity. It was being
-- used as the from_email on 14 templates, which produced
-- self-addressed-looking mail (an admin alert sent from info@ TO info@)
-- and put the owner's real inbox address in the visible From header of
-- every account-security email sent to any customer. The sending domain
-- is already verified (SPF/DKIM) for every local part on it, so switching
-- to a different address on the same domain works immediately, no
-- additional sender registration required.

-- Owner-only internal alerts -> me@ (never sent to anyone but the owner).
UPDATE email_templates SET from_email = 'owner@example.com', updated_at = now()
WHERE key IN (
  'author-application-admin-notify',
  'contact-form-admin-notify',
  'payment-claim-admin-notify',
  'review-submitted-admin-notify',
  'payment-grant-failed-alert'
);

-- Everything else that goes to an actual customer/applicant/admin invite,
-- currently on info@ -> support@ (the site's existing general-purpose
-- external sender).
UPDATE email_templates SET from_email = 'support@example.com', updated_at = now()
WHERE key IN (
  'author-application-approved',
  'author-application-rejected',
  'console-admin-invite',
  'review-question-to-author',
  'contact-form-reply',
  'email-verification',
  'magic-link-login',
  'password-reset',
  'otp-code'
);

COMMIT;
