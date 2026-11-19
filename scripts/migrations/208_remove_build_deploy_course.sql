-- Remove "Build & Deploy Your Own AI Agency".
--
-- Owner decision (2026-11-19): the course never launched. Its sales page
-- was still a draft, no lesson videos were ever recorded, and nobody has
-- bought it (the course_purchase and course_upgrade_to_pro flows for it
-- have sent zero emails). Keeping a published, empty course live was worse
-- than removing it.
--
-- The console's own DELETE route refuses this (it 409s on a published
-- course, and again on one with enrolments, payment records, waitlist
-- signups or active email flows). That guard is right for an accidental
-- click and wrong here, so the removal is done deliberately and in the
-- open, as a migration.
--
-- LEADS ARE KEPT, as asked. Nothing below touches `contacts` or `users`,
-- and neither is reachable by cascade from `courses`. The five people who
-- enrolled stay exactly as they were, with their contact record, their
-- source attribution and their email history intact. They lose only the
-- enrolment row pointing at a course that no longer exists.
-- course_waitlist_signups is deliberately left alone too: it keys off a
-- slug rather than a foreign key, so those rows are standalone lead
-- records and are not deleted with the course.
--
-- Everything else goes by cascade from courses(id):
--   course_modules   -> course_lessons -> lesson progress/resources
--   course_enrollments, payment_orders, payment_claims, email_flows
--     (-> email_flow_steps, and email_flow_runs.course_id -> NULL)

BEGIN;

-- The two waitlist flows carry course_id NULL (they predate the course row
-- and were matched by trigger, not by id), so no cascade reaches them.
DELETE FROM email_flows
WHERE course_id IS NULL
  AND trigger_key IN ('course_waitlist_signup', 'course_waitlist_early_bird_paid')
  AND name LIKE 'Build & Deploy%';

DELETE FROM courses WHERE slug = 'build-deploy-your-own-ai-agency';

COMMIT;
