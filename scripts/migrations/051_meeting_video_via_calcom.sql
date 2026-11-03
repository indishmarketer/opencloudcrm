-- Meetings now use Cal.com's own Cal Video room as the actual meeting
-- room (owner's decision, 2026-08-29) instead of a Daily.co room we
-- create ourselves -- daily_room_name is no longer written anywhere.
-- The video URL is computed on the fly from calcom_booking_uid
-- (https://app.cal.com/video/{uid}, Cal Video's stable convention), so no
-- replacement column is needed.
ALTER TABLE meeting_bookings DROP COLUMN IF EXISTS daily_room_name;

-- Real post-meeting analytics, populated by the Cal.com webhook handler
-- from MEETING_STARTED / MEETING_ENDED / AFTER_HOSTS_CAL_VIDEO_NO_SHOW /
-- AFTER_GUESTS_CAL_VIDEO_NO_SHOW events (already subscribed on the
-- existing webhook, no Cal.com-side config change needed).
ALTER TABLE meeting_bookings ADD COLUMN IF NOT EXISTS actual_start_at TIMESTAMPTZ;
ALTER TABLE meeting_bookings ADD COLUMN IF NOT EXISTS actual_end_at TIMESTAMPTZ;
ALTER TABLE meeting_bookings ADD COLUMN IF NOT EXISTS host_no_show BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE meeting_bookings ADD COLUMN IF NOT EXISTS guest_no_show BOOLEAN NOT NULL DEFAULT false;
