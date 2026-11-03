-- Email automation: visible, editable, trigger-based email flows.
-- Replaces the old hardcoded course-nudge cron logic and the newsletter
-- "compose and blast" feature with something the owner can manage
-- directly in console (create flows, add delayed steps, edit content),
-- without needing code changes for every new sequence.

CREATE TABLE IF NOT EXISTS email_flows (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_key TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_flow_steps (
  id SERIAL PRIMARY KEY,
  flow_id INTEGER NOT NULL REFERENCES email_flows(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  delay_days INTEGER NOT NULL DEFAULT 0,
  from_email TEXT NOT NULL DEFAULT 'academy@example.com',
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_flow_steps_flow ON email_flow_steps(flow_id, position);

CREATE TABLE IF NOT EXISTS email_flow_scheduled (
  id SERIAL PRIMARY KEY,
  step_id INTEGER NOT NULL REFERENCES email_flow_steps(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  send_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_flow_scheduled_due ON email_flow_scheduled(send_at) WHERE status = 'pending';

-- Seed: migrate the existing hardcoded "free tier -> PRO nudge after 3
-- days" cron logic into a real, visible, editable flow, so the owner has
-- one real working example on day one instead of an empty list.
INSERT INTO email_flows (name, trigger_key, active)
VALUES ('Free trial -> PRO nudge', 'course_enroll_free', true)
ON CONFLICT DO NOTHING;

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT id, 0, 3, 'academy@example.com',
  'Still writing on Medium? Here''s what PRO unlocks',
  '<p>You''ve had free access to {{course_title}} for a few days now.</p><p>PRO unlocks the advanced modules, plus direct support.</p><p><a href="{{course_url}}">See what''s in PRO</a></p>'
FROM email_flows WHERE trigger_key = 'course_enroll_free'
ON CONFLICT DO NOTHING;
