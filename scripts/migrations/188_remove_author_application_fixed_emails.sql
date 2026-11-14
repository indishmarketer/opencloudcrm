-- Converts author-application emails into a normal, deletable/editable
-- concern. The existing author_application.submitted/draft_submitted/
-- accepted events, plus the new author_application.reviewed event (fired
-- for approved/rejected/changes_requested -- see
-- src/app/api/console/author-applications/[id]/route.ts), let a
-- self-hoster build their own replacement automation. Code-side
-- getEmailTemplate() calls for these keys were changed to
-- getEmailTemplateOptional(), which skips the send instead of throwing
-- once the row is gone.

BEGIN;

DELETE FROM email_templates WHERE key IN (
  'author-application-received',
  'author-application-approved',
  'author-application-rejected',
  'author-application-changes-requested',
  'author-application-draft-accepted'
);

COMMIT;
