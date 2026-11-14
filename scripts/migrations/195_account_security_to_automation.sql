-- Signup verification, password reset, console login link, account email
-- change, and console admin invite are no longer code-driven lookups by a
-- fixed key -- each now fires a real webhook event (account.verification_requested,
-- account.password_reset_requested, console_admin.login_link_requested,
-- account.email_change_requested, console_admin.invited; see
-- src/lib/webhookEventCatalogue.ts) that a self-built Workflow automation
-- picks up. Nothing in the app looks these five keys up anymore, so the
-- rows are removed outright rather than left as orphaned, unreferenced
-- "fixed" templates.
--
-- otp-code, contact-form-reply, review-question-to-author, and
-- webinar-guest-signin are deliberately NOT touched -- see the comments at
-- their call sites for why each one stays a direct, code-driven send.

BEGIN;

DELETE FROM email_templates WHERE key IN (
  'email-verification',
  'password-reset',
  'magic-link-login',
  'account-email-change',
  'console-admin-invite'
);

COMMIT;
