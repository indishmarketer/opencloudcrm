-- Lets an attendee tell the host what they want to discuss before a call,
-- surfaced in the console -- previously the booking form only collected
-- name and email, so the host had zero context walking into a call.
ALTER TABLE meeting_bookings ADD COLUMN IF NOT EXISTS notes TEXT;
