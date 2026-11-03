-- Sign-in, reset and verification links used to pass through the click
-- tracker, which stored the full URL (one-time token included) in
-- email_events.meta.target. Those tokens are long expired, but keep only
-- the page address. New sends no longer track token links (src/lib/email.ts).
UPDATE email_events
SET meta = jsonb_set(meta, '{target}', to_jsonb(split_part(meta->>'target', '?', 1)))
WHERE event = 'clicked' AND meta->>'target' ~* '[?&]token=';

-- The click dedupe key embedded the same URL. The row id keeps it unique.
UPDATE email_events
SET provider_event_key = split_part(provider_event_key, '?', 1) || ':scrubbed:' || id
WHERE provider_event_key LIKE 'redirect:clicked:%' AND provider_event_key ~* '[?&]token=';
