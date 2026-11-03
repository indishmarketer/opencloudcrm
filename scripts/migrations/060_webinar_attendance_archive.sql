-- webinar_access is one row per (webinar, user) -- when someone re-registers
-- after a broadcast they already attended (moving them to a new upcoming
-- occurrence), that single row gets reassigned in place, silently zeroing
-- watch_seconds/completed_at for the occurrence they just finished. That
-- corrupts the per-broadcast Analytics comparison (console/webinars/[id]/analytics),
-- which groups by session_start_at and has no way to recover data for an
-- occurrence nobody's live row points at anymore.
--
-- This table captures a snapshot of the outgoing occurrence's final stats
-- right before that overwrite happens, so historical broadcast performance
-- stays intact regardless of what a user does afterward. Snapshots are only
-- written when there's real attendance data worth preserving (watch_seconds
-- > 0 or completed_at set) -- a bare re-click with no attendance history
-- has nothing worth archiving.

CREATE TABLE IF NOT EXISTS webinar_attendance_archive (
  id BIGSERIAL PRIMARY KEY,
  webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  session_start_at TIMESTAMPTZ NOT NULL,
  attendee_timezone TEXT,
  registered_at TIMESTAMPTZ,
  watch_seconds INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webinar_attendance_archive_lookup
  ON webinar_attendance_archive(webinar_id, session_start_at);
