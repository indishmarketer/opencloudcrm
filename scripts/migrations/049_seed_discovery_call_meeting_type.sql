-- Seeds the single real meeting_types row for the owner's actual Cal.com
-- event type, so the already-wired "Book a call" CTAs (/book/discovery-call)
-- resolve instead of 404ing. Values verified live against the real Cal.com
-- account 2026-08-29 (event type id 874353, slug "15min", owner username
-- "indishmarketer"). Safe to re-run (ON CONFLICT DO NOTHING on the unique slug).
INSERT INTO meeting_types (slug, name, description, duration_minutes, calcom_event_type_id, calcom_username, calcom_event_slug, active)
VALUES ('discovery-call', '15 Min Discovery Call', 'A short call to discuss your goals and see if we''re a good fit.', 15, '874353', 'indishmarketer', '15min', true)
ON CONFLICT (slug) DO NOTHING;
