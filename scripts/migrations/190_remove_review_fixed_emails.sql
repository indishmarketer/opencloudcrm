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
--
-- review_requests.template_key and email_flow_steps.review_template_key
-- both carry a hard FK (ON DELETE RESTRICT) to email_templates(key), added
-- back in migration 047 when every email_templates row was assumed
-- permanent. That assumption is exactly what this migration series
-- retires -- a self-hoster can now delete this content, and
-- src/lib/reviewRequests.ts / emailDispatcher.ts already fall back to
-- the literal "google-review-request" key and degrade gracefully
-- (getEmailTemplateOptional) when it's gone. A hard FK on a column that's
-- meant to tolerate a missing key is a correctness bug now, not a safety
-- net, so both are dropped -- this failed live on first deploy
-- (review_requests_template_key_fkey) before this fix.

BEGIN;

ALTER TABLE review_requests DROP CONSTRAINT IF EXISTS review_requests_template_key_fkey;
ALTER TABLE email_flow_steps DROP CONSTRAINT IF EXISTS email_flow_steps_review_template_key_fkey;

DELETE FROM email_templates WHERE key IN (
  'review-submission-received',
  'review-submitted-admin-notify',
  'google-review-request',
  'google-review-reminder'
);

COMMIT;
