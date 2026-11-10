-- Seeds a placeholder meeting_types row so the already-wired "Book a call"
-- CTAs (/book/discovery-call) have a row to resolve against. Seeded INACTIVE
-- with no real Cal.com account attached -- a previous version of this seed
-- pointed every fresh install at the original project maintainer's own live
-- Cal.com account, which would have sent other businesses' prospects'
-- bookings straight into that maintainer's calendar. Activate this (and
-- point it at your own Cal.com event type) from Console -> Meetings -> Types.
-- Safe to re-run (ON CONFLICT DO NOTHING on the unique slug).
INSERT INTO meeting_types (slug, name, description, duration_minutes, calcom_event_type_id, calcom_username, calcom_event_slug, active)
VALUES ('discovery-call', '15 Min Discovery Call', 'A short call to discuss your goals and see if we''re a good fit.', 15, '', '', '', false)
ON CONFLICT (slug) DO NOTHING;
