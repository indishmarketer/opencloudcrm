-- Converts tool-directory submission emails into a normal,
-- deletable/editable concern. The existing directory_tool.submitted event,
-- plus the new directory_tool.reviewed event (fired for approved/
-- approved_unpaid/changes_requested/rejected -- see
-- src/lib/directoryReview.ts), let a self-hoster build their own
-- replacement automation. Code-side getEmailTemplate() calls for these
-- keys were changed to getEmailTemplateOptional().

BEGIN;

DELETE FROM email_templates WHERE key IN (
  'tool-submission-admin-notify',
  'tool-submission-approved',
  'tool-submission-approved-payment',
  'tool-submission-changes-requested',
  'tool-submission-rejected'
);

COMMIT;
