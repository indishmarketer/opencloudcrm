BEGIN;

-- Google's Basic GBP API access was never approved after 10+ days waiting
-- (support case 1-3124000040982), so the OAuth/Pub-Sub/sync integration is
-- removed entirely. What remains is the simple, always-working piece: an
-- admin-entered official "Ask for reviews" link, stored once, used to email
-- review requests to contacts. No API, no quota, nothing to wait on Google for.

ALTER TABLE review_requests DROP CONSTRAINT IF EXISTS review_requests_location_id_fkey;
ALTER TABLE review_requests DROP COLUMN IF EXISTS location_id;

DROP TABLE IF EXISTS google_reviews;
DROP TABLE IF EXISTS google_business_locations;
DROP TABLE IF EXISTS google_business_oauth_states;
DROP TABLE IF EXISTS google_business_sync_events;
DROP TABLE IF EXISTS google_business_audit_log;
DROP TABLE IF EXISTS google_business_connections;

-- The single official review link lives in the existing generic key/value
-- settings table, same pattern as the promo banner.
INSERT INTO site_settings (key, value, updated_at)
VALUES ('google_review_url', '', now())
ON CONFLICT (key) DO NOTHING;

-- Let a review request notify a logged-in contact in-app, not just by email.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['post_approved','post_liked','post_commented','comment_replied','new_message','course_inactive','review_requested']));

COMMIT;
