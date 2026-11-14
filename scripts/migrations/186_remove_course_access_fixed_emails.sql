-- Converts "course access" from a set of hardcoded, non-deletable
-- transactional emails into a normal, self-hoster-owned concern: the
-- course.enrolled / course.upgraded webhook events these flows already
-- emit (see coursePurchaseGrant.ts, courseGrant.ts, the courses enrollments
-- and claims console routes, and the free-tier enroll page) still fire
-- after this migration, so a replacement automation can be built from the
-- console. The code-side getEmailTemplate() calls for these six keys were
-- changed to getEmailTemplateOptional(), which skips the send instead of
-- throwing once the row below is gone.

BEGIN;

DELETE FROM email_templates WHERE key IN (
  'course-access-granted-pro',
  'course-access-granted-free',
  'course-access-granted-manual',
  'course-access-granted-new-account',
  'course-access-granted-claim-approved',
  'course-access-upgraded'
);

COMMIT;
