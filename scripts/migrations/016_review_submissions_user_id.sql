-- Reviews now require a logged-in account (same synced account used for
-- courses/community/comments) instead of a freeform typed name. Tie each
-- submission to the account that posted it.
ALTER TABLE review_submissions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_review_submissions_user ON review_submissions(user_id);
