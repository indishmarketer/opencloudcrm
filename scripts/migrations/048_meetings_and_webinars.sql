-- Foundation schema for two new verticals: Cal.com+Daily.co meetings, and
-- Mux-hosted on-demand webinars. Purely additive (IF NOT EXISTS everywhere,
-- no drops/renames), safe to re-run. Mirrors existing conventions:
-- course_enrollments' (user_id, resource_id, UNIQUE) entitlement shape for
-- webinar_access, course_comments' shape for webinar_comments, and
-- webhook_outbox_events' idempotency-by-external-id approach for
-- meeting_bookings (calcom_booking_uid) and webinars (mux_upload_id/mux_asset_id).

CREATE TABLE IF NOT EXISTS meeting_types (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  calcom_event_type_id TEXT NOT NULL,
  calcom_username TEXT NOT NULL,
  calcom_event_slug TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_bookings (
  id BIGSERIAL PRIMARY KEY,
  meeting_type_id INTEGER NOT NULL REFERENCES meeting_types(id) ON DELETE RESTRICT,
  calcom_booking_uid TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  attendee_name TEXT NOT NULL,
  attendee_email TEXT NOT NULL,
  attendee_timezone TEXT NOT NULL,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'rescheduled', 'completed')),
  daily_room_name TEXT,
  cancellation_reason TEXT,
  rescheduled_from_booking_id BIGINT REFERENCES meeting_bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meeting_bookings_scheduled_start
  ON meeting_bookings(scheduled_start) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_meeting_bookings_contact ON meeting_bookings(contact_id);
CREATE INDEX IF NOT EXISTS idx_meeting_bookings_user ON meeting_bookings(user_id);

-- Tracks which reminder offsets have already been sent per booking, so the
-- reminder cron can be a plain idempotent "find due, not yet sent, send,
-- record" loop without needing full outbox/retry machinery -- reminder
-- emails are non-critical and next-tick-retryable by construction.
CREATE TABLE IF NOT EXISTS meeting_reminders (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES meeting_bookings(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('24h', '1h')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, reminder_type)
);

CREATE TABLE IF NOT EXISTS webinars (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  mux_upload_id TEXT,
  mux_asset_id TEXT,
  mux_playback_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'ready', 'errored', 'published', 'archived')),
  duration_seconds INTEGER,
  access_tier TEXT NOT NULL DEFAULT 'free' CHECK (access_tier IN ('free', 'pro')),
  release_at TIMESTAMPTZ,
  requires_registration BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webinars_mux_upload ON webinars(mux_upload_id);
CREATE INDEX IF NOT EXISTS idx_webinars_mux_asset ON webinars(mux_asset_id);

CREATE TABLE IF NOT EXISTS webinar_access (
  id BIGSERIAL PRIMARY KEY,
  webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (webinar_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_webinar_access_user ON webinar_access(user_id);

-- Same shape as course_comments; is_question distinguishes Q&A from plain
-- comments within one table/thread rather than splitting into two tables.
CREATE TABLE IF NOT EXISTS webinar_comments (
  id SERIAL PRIMARY KEY,
  webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id INTEGER REFERENCES webinar_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_question BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webinar_comments_webinar ON webinar_comments(webinar_id);
