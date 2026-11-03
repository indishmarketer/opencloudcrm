-- Robust automation journeys: optional entry segments, behavioral branches,
-- exit goals, durable per-person runs, and safe cleanup of obsolete flows.

BEGIN;

ALTER TABLE email_flows
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'service'
    CHECK (purpose IN ('service', 'marketing')),
  ADD COLUMN IF NOT EXISTS entry_segment_id INTEGER REFERENCES contact_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goal_type TEXT NOT NULL DEFAULT 'none'
    CHECK (goal_type IN ('none', 'course_pro', 'course_completed', 'community_first_post')),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE email_flow_steps
  ADD COLUMN IF NOT EXISTS condition_type TEXT NOT NULL DEFAULT 'always'
    CHECK (condition_type IN ('always', 'opened', 'not_opened', 'clicked', 'not_clicked')),
  ADD COLUMN IF NOT EXISTS condition_step_id INTEGER REFERENCES email_flow_steps(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS email_flow_runs (
  id BIGSERIAL PRIMARY KEY,
  flow_id INTEGER NOT NULL REFERENCES email_flows(id) ON DELETE CASCADE,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  event_key TEXT,
  vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'exited', 'cancelled')),
  exit_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (flow_id, event_key)
);
CREATE INDEX IF NOT EXISTS idx_email_flow_runs_contact ON email_flow_runs(contact_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_flow_runs_active ON email_flow_runs(flow_id, status) WHERE status = 'active';

ALTER TABLE email_flow_scheduled
  ADD COLUMN IF NOT EXISTS run_id BIGINT REFERENCES email_flow_runs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS skipped_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_email_flow_scheduled_run ON email_flow_scheduled(run_id, status);

ALTER TABLE email_deliveries
  ADD COLUMN IF NOT EXISTS flow_run_id BIGINT REFERENCES email_flow_runs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_email_deliveries_flow_run ON email_deliveries(flow_run_id, flow_step_id);

-- Every campaign gets live, automatic follow-up audiences. Their membership
-- changes as delivery events arrive; no manual contact copying is involved.
INSERT INTO contact_segments (name, description, rules, is_system)
SELECT 'Campaign #' || nc.id || ' — ' || v.label,
       v.description || nc.id || ': ' || nc.subject,
       jsonb_build_object('match', 'all', 'rules', jsonb_build_array(
         jsonb_build_object('field', 'marketing_status', 'operator', 'equals', 'value', 'subscribed'),
         jsonb_build_object('field', v.field, 'operator', 'equals', 'value', nc.id::text)
       )), true
FROM newsletter_campaigns nc
CROSS JOIN (VALUES
  ('opened', 'People who opened campaign #', 'campaign_opened'),
  ('not opened after 48h', 'People who did not open campaign #', 'campaign_not_opened'),
  ('clicked', 'People who clicked campaign #', 'campaign_clicked')
) AS v(label, description, field)
WHERE NOT EXISTS (
  SELECT 1 FROM contact_segments cs
  WHERE lower(cs.name) = lower('Campaign #' || nc.id || ' — ' || v.label)
);

-- The waitlist feature was removed. Archive its flows and cancel the one
-- legacy pending row so they no longer confuse the console or remain queued.
UPDATE email_flows
SET active = false, archived_at = COALESCE(archived_at, now())
WHERE trigger_key IN ('course_waitlist_signup', 'course_waitlist_early_bird_paid');

UPDATE email_flow_scheduled s
SET status = 'skipped', skipped_reason = 'Obsolete waitlist flow archived'
FROM email_flow_steps st
JOIN email_flows f ON f.id = st.flow_id
WHERE s.step_id = st.id
  AND f.trigger_key IN ('course_waitlist_signup', 'course_waitlist_early_bird_paid')
  AND s.status = 'pending';

-- The upgrade nudge and the inactivity reminder previously collided on day 3.
-- Keep the useful inactivity reminder at day 3 and move the upgrade nudge to
-- day 7. It now exits automatically if the learner already has PRO access.
UPDATE email_flows
SET name = 'Medium free learner -> PRO (day 7)', goal_type = 'course_pro', purpose = 'service'
WHERE trigger_key = 'course_enroll_free'
  AND course_id = (SELECT id FROM courses WHERE slug = 'medium-writing-monetization-challenge');

UPDATE email_flow_steps
SET delay_days = 7
WHERE flow_id IN (
  SELECT id FROM email_flows
  WHERE trigger_key = 'course_enroll_free'
    AND course_id = (SELECT id FROM courses WHERE slug = 'medium-writing-monetization-challenge')
);

UPDATE email_flows
SET goal_type = 'course_completed', purpose = 'service'
WHERE trigger_key = 'course_inactivity' AND archived_at IS NULL;

-- Build & Deploy was added after the original inactivity-flow migration.
-- Create missing course-specific templates paused, so the owner can review
-- the wording before any newly-created workflow starts sending.
INSERT INTO email_flows (name, trigger_key, course_id, active, purpose, goal_type)
SELECT 'Course inactivity - ' || c.title, 'course_inactivity', c.id, false, 'service', 'course_completed'
FROM courses c
WHERE c.published = true
  AND NOT EXISTS (
    SELECT 1 FROM email_flows f
    WHERE f.trigger_key = 'course_inactivity' AND f.course_id = c.id AND f.archived_at IS NULL
  );

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT f.id, 0, 3, 'academy@example.com',
  'Pick up where you left off: {{course_title}}',
  '<p>Hi {{first_name}},</p><p>You are {{completed_lessons}} of {{total_lessons}} lessons into {{course_title}}. Your access does not expire, so continue whenever you are ready.</p><p><a href="{{course_url}}">Continue the course</a></p>'
FROM email_flows f
WHERE f.trigger_key = 'course_inactivity'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id);

-- A free-to-PRO template is useful only for a course that actually has both
-- tiers. Seed missing ones paused instead of creating irrelevant workflows.
INSERT INTO email_flows (name, trigger_key, course_id, active, purpose, goal_type)
SELECT c.title || ' free learner -> PRO', 'course_enroll_free', c.id, false, 'service', 'course_pro'
FROM courses c
WHERE c.published = true
  AND (c.price_inr IS NOT NULL OR c.price_usd IS NOT NULL)
  AND EXISTS (SELECT 1 FROM course_modules m WHERE m.course_id = c.id AND m.tier = 'free')
  AND EXISTS (SELECT 1 FROM course_modules m WHERE m.course_id = c.id AND m.tier = 'pro')
  AND NOT EXISTS (
    SELECT 1 FROM email_flows f
    WHERE f.trigger_key = 'course_enroll_free' AND f.course_id = c.id AND f.archived_at IS NULL
  );

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT f.id, 0, 7, 'academy@example.com',
  'Ready for the next part of {{course_title}}?',
  '<p>Hi {{first_name}},</p><p>You have started {{course_title}}. When you are ready, PRO unlocks the complete course.</p><p><a href="{{course_url}}">See the PRO curriculum</a></p>'
FROM email_flows f
WHERE f.trigger_key = 'course_enroll_free'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id);

COMMIT;
