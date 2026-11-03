-- Per-lesson course comments, same shape as blog_comments.
-- Safe to re-run: every statement is IF NOT EXISTS / additive.

CREATE TABLE IF NOT EXISTS course_comments (
  id SERIAL PRIMARY KEY,
  lesson_id INTEGER NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id INTEGER REFERENCES course_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_comments_lesson ON course_comments(lesson_id);
