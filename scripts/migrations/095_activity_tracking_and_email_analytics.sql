-- Website activity + email analytics groundwork.
--
-- users.last_seen_at existed but nothing ever wrote it, so "active in the
-- last 7 days" was always 0. getSession() (src/lib/auth.ts) now stamps it,
-- at most every 10 minutes per user, and logs one row per user per India
-- day here, so contacts and segments can filter on "active on the site
-- between X and Y", not just "last seen".

BEGIN;

CREATE TABLE IF NOT EXISTS user_activity_days (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_user_activity_days_day ON user_activity_days (day);

-- Backfill from what the site already recorded: signups, set-password
-- (email verified), lessons completed, and community/course comments.
INSERT INTO user_activity_days (user_id, day)
SELECT user_id, (ts AT TIME ZONE 'Asia/Kolkata')::date FROM (
  SELECT id AS user_id, created_at AS ts FROM users
  UNION ALL SELECT id, email_verified_at FROM users WHERE email_verified_at IS NOT NULL
  UNION ALL SELECT user_id, completed_at FROM lesson_progress
  UNION ALL SELECT user_id, created_at FROM forum_posts
  UNION ALL SELECT user_id, created_at FROM forum_comments
  UNION ALL SELECT user_id, created_at FROM course_comments
) src
WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migration-created accounts were made by the import, not by the person,
-- so their creation day is not real activity.
DELETE FROM user_activity_days a
USING course_access_invites i, users u
WHERE a.user_id = i.user_id AND u.id = i.user_id AND NOT i.account_existed
  AND a.day = (u.created_at AT TIME ZONE 'Asia/Kolkata')::date
  AND (u.email_verified_at IS NULL OR a.day <> (u.email_verified_at AT TIME ZONE 'Asia/Kolkata')::date);

UPDATE users u SET last_seen_at = s.last_ts
FROM (
  SELECT user_id, max(ts) AS last_ts FROM (
    SELECT id AS user_id, email_verified_at AS ts FROM users WHERE email_verified_at IS NOT NULL
    UNION ALL SELECT user_id, completed_at FROM lesson_progress
    UNION ALL SELECT user_id, created_at FROM forum_posts
    UNION ALL SELECT user_id, created_at FROM forum_comments
    UNION ALL SELECT user_id, created_at FROM course_comments
  ) x GROUP BY user_id
) s
WHERE u.id = s.user_id AND (u.last_seen_at IS NULL OR u.last_seen_at < s.last_ts);

-- Analytics reads by send date and by event type + date.
CREATE INDEX IF NOT EXISTS idx_email_deliveries_sent_at ON email_deliveries (sent_at) WHERE NOT is_test;
CREATE INDEX IF NOT EXISTS idx_email_events_event_created ON email_events (event, created_at);

COMMIT;
