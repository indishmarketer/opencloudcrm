-- Pre-launch waitlist for "Build & Deploy Your Own AI Agency" (and any
-- future pre-launch course validated the same way before video exists).
-- Free signup + optional early-bird one-time payment to lock in a
-- discounted price ahead of launch.

CREATE TABLE IF NOT EXISTS course_waitlist_signups (
  id SERIAL PRIMARY KEY,
  course_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  early_bird_paid BOOLEAN NOT NULL DEFAULT false,
  razorpay_payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  UNIQUE (course_slug, email)
);
CREATE INDEX IF NOT EXISTS idx_course_waitlist_course ON course_waitlist_signups(course_slug);

-- Starter flows on the two new triggers (see EMAIL_TRIGGERS in
-- src/lib/emailAutomation.ts) so the owner has editable copy on day one
-- instead of an empty list in /console/automation.
INSERT INTO email_flows (name, trigger_key, active)
VALUES ('Build & Deploy waitlist welcome', 'course_waitlist_signup', true)
ON CONFLICT DO NOTHING;

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT id, 0, 0, 'academy@example.com',
  'You''re on the list for {{course_title}}',
  '<p>Hey {{first_name}},</p><p>You''re on the early list for {{course_title}} -- a course on building and deploying a full business platform yourself, using AI agents from the terminal.</p><p>No video yet on purpose: I''m building this in the open, and this list decides whether it gets made. You''ll hear from me as it comes together, with first access before anyone else.</p><p>Want to lock in the early-bird price now? <a href="{{course_url}}">Grab it here</a> before it goes to full price.</p>'
FROM email_flows WHERE trigger_key = 'course_waitlist_signup'
ON CONFLICT DO NOTHING;

INSERT INTO email_flows (name, trigger_key, active)
VALUES ('Build & Deploy early-bird confirmation', 'course_waitlist_early_bird_paid', true)
ON CONFLICT DO NOTHING;

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT id, 0, 0, 'academy@example.com',
  'Locked in: {{course_title}} at the early-bird price',
  '<p>Hey {{first_name}},</p><p>You''re locked in for {{course_title}} at the early-bird price -- that won''t change even after the course launches at full price.</p><p>I''ll email you the moment lessons go live. Thanks for backing this before it exists.</p>'
FROM email_flows WHERE trigger_key = 'course_waitlist_early_bird_paid'
ON CONFLICT DO NOTHING;
