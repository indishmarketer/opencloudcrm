-- Email flows for course_enroll_free / course_purchase / course_upgrade_to_pro
-- must be scoped to a specific course -- with 2+ courses now (and more
-- coming), a flow can't apply to "any course enrolled free" undifferentiated,
-- or a nudge written for one course's copy fires for a totally different
-- course. course_id is nullable only because user_signup_verified and
-- newsletter_signup flows have no course context at all.
ALTER TABLE email_flows ADD COLUMN IF NOT EXISTS course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE;

-- New flows default to inactive -- an admin should review a freshly built
-- flow (which may be mid-edit, incomplete copy) before it can actually
-- email real people, not have it live the instant it's created.
ALTER TABLE email_flows ALTER COLUMN active SET DEFAULT false;

-- The seeded "Free trial -> PRO nudge" flow was written specifically for
-- the Medium course's copy ("Still writing on Medium?") -- scope it
-- correctly now that flows are course-specific, and set it inactive so
-- it doesn't stay live mid-transition without the owner reviewing it
-- again under the new course-scoped behavior.
UPDATE email_flows
SET course_id = (SELECT id FROM courses WHERE slug = 'medium-writing-monetization-challenge'),
    active = false
WHERE trigger_key = 'course_enroll_free' AND course_id IS NULL;
