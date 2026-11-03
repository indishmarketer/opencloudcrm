-- Private, host-only notes per booking -- distinct from the "notes" column,
-- which is the attendee's own message submitted at booking time. Never
-- shown to the attendee, only in the console.
ALTER TABLE meeting_bookings ADD COLUMN IF NOT EXISTS admin_notes text;
