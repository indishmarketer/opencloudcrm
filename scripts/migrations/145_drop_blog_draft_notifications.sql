-- The blog-draft-added notification no longer exists (owner's call,
-- 2026-10-29): with the blog console UI, every draft is created
-- intentionally by the person creating it, so "a new draft appeared" is not
-- something worth alerting on. These tables backed that alert only.
DROP TABLE IF EXISTS blog_draft_notifications;
DROP TABLE IF EXISTS blog_draft_notification_state;
