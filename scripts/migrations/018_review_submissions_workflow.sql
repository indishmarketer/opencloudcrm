-- Supports the console review workflow: pending -> approved/rejected
-- directly, or pending -> needs_info (admin asks the reviewer a question by
-- email) -> approved/rejected once they've responded. admin_note stores
-- whatever question/reason was sent so it's visible in the console later.
ALTER TABLE review_submissions ADD COLUMN IF NOT EXISTS admin_note TEXT;
