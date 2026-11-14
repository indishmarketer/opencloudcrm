-- Converts review-related notification emails into a normal,
-- deletable/editable concern. The existing review.submitted webhook event
-- (src/app/api/reviews/submit/route.ts) already fires independently, so a
-- self-hoster can build their own replacement automation for the
-- "thanks for your review" notification. The two Google-review-request
-- templates are also made deletable: they're already just the content for
-- an existing review-request action (src/lib/reviewRequests.ts), which now
-- skips the send gracefully (marks the request done) if the row is gone,
-- rather than retrying forever. 'review-submitted-admin-notify' had no
-- remaining call site at all and is removed as dead weight.
--
-- 'review-question-to-author' is deliberately NOT included: it is not a
-- notification template, it's the delivery envelope for an admin-typed
-- question (arbitrary text), so it stays fixed -- same reasoning as
-- 'contact-form-reply' in migration 189.

BEGIN;

DELETE FROM email_templates WHERE key IN (
  'review-submission-received',
  'review-submitted-admin-notify',
  'google-review-request',
  'google-review-reminder'
);

COMMIT;
