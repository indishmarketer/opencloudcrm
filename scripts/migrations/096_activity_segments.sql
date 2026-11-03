-- Ready-made activity segments (owner request 2026-10-01): who opened email
-- and who used the website recently. Rule fields are defined in
-- src/lib/contactSegmentTypes.ts (DAY_FIELDS).

BEGIN;

INSERT INTO contact_segments (name, description, rules, is_system)
SELECT v.name, v.description, v.rules::jsonb, true
FROM (VALUES
  ('Opened email in the last 7 days', 'Anyone who opened or clicked any email in the last 7 days.',
   '{"match":"all","rules":[{"field":"email_opened_days","operator":"within","value":"7"}]}'),
  ('Opened email in the last 30 days', 'Anyone who opened or clicked any email in the last 30 days.',
   '{"match":"all","rules":[{"field":"email_opened_days","operator":"within","value":"30"}]}'),
  ('Active on the website in the last 7 days', 'Signed-in visits to the website in the last 7 days.',
   '{"match":"all","rules":[{"field":"site_active_days","operator":"within","value":"7"}]}'),
  ('Active on the website in the last 30 days', 'Signed-in visits to the website in the last 30 days.',
   '{"match":"all","rules":[{"field":"site_active_days","operator":"within","value":"30"}]}'),
  ('Subscribers gone quiet (90 days)', 'Marketable contacts with no email open or click in the last 90 days. Re-engage or clean out.',
   '{"match":"all","rules":[{"field":"marketing_status","operator":"equals","value":"subscribed"},{"field":"email_not_opened_days","operator":"within","value":"90"}]}')
) AS v(name, description, rules)
WHERE NOT EXISTS (SELECT 1 FROM contact_segments s WHERE s.name = v.name);

COMMIT;
