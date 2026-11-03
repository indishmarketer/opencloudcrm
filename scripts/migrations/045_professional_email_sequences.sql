-- Complete the real lifecycle map with concise, purposeful sequences and
-- missing user-facing transactional acknowledgements.
BEGIN;

INSERT INTO email_templates
  (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars)
VALUES
  ('contact-form-received', 'community-support', 'Contact message received',
   'Confirms that a visitor''s verified contact message reached the team.',
   'We received your message',
   '<p>Hi {{first_name}},</p><p>Thanks for contacting Indish Marketer. Your message has reached us and we will reply as soon as we can.</p>',
   'support@example.com', false, true, ARRAY['first_name']),
  ('author-application-received', 'admin', 'Author application received',
   'Confirms that an author application is waiting for review.',
   'Your author application is under review',
   '<p>Hi {{first_name}},</p><p>We received your author application. We will review the topics and sample you submitted and email you when a decision is made.</p>',
   'support@example.com', false, true, ARRAY['first_name']),
  ('tool-submission-received', 'community-support', 'Tool submission received',
   'Confirms that a directory tool submission entered moderation.',
   'We received {{tool_name}}',
   '<p>Hi {{first_name}},</p><p>Your submission for <strong>{{tool_name}}</strong> is now waiting for review. We will publish it after it passes moderation.</p>',
   'support@example.com', false, true, ARRAY['first_name','tool_name']),
  ('review-submission-received', 'community-support', 'Review submission received',
   'Confirms that a submitted review entered moderation.',
   'Your review is under review',
   '<p>Hi {{first_name}},</p><p>Thanks for sharing your review. It is now waiting for moderation, and we will contact you if we need any clarification.</p>',
   'support@example.com', false, true, ARRAY['first_name']),
  ('payment-claim-received', 'courses', 'Manual payment claim received',
   'Confirms that a manual course-payment claim is pending verification.',
   'Payment claim received for {{course_title}}',
   '<p>Hi {{first_name}},</p><p>We received your payment claim for {{course_title}}. We will verify it and email you when course access is granted.</p>',
   'academy@example.com', false, true, ARRAY['first_name','course_title'])
ON CONFLICT (key) DO NOTHING;

INSERT INTO email_flows (name, trigger_key, active, purpose, goal_type)
SELECT 'Verified account welcome', 'user_signup_verified', true, 'service', 'none'
WHERE NOT EXISTS (SELECT 1 FROM email_flows WHERE trigger_key = 'user_signup_verified' AND archived_at IS NULL);

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT f.id, 0, 0, 'support@example.com',
  'Welcome',
  '<p>Hi {{first_name}},</p><p>Your account is ready. You can now join courses, participate in the community, submit tools, and try our products from one profile.</p><p><a href="/account">Open your account</a></p>'
FROM email_flows f WHERE f.trigger_key = 'user_signup_verified'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id AND st.position = 0);

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT f.id, 1, 3, 'support@example.com',
  'Three useful places to start',
  '<p>Hi {{first_name}},</p><p>When you are ready, explore the courses, join a useful community discussion, or try one of our practical marketing tools.</p><p><a href="/account">Choose where to start</a></p>'
FROM email_flows f WHERE f.trigger_key = 'user_signup_verified'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id AND st.position = 1);

INSERT INTO email_flows (name, trigger_key, active, purpose, goal_type)
SELECT 'Voice agent interest follow-up', 'voice_agent_interest', true, 'service', 'none'
WHERE NOT EXISTS (SELECT 1 FROM email_flows WHERE trigger_key = 'voice_agent_interest' AND archived_at IS NULL);

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT f.id, 0, 0, 'support@example.com',
  'Thanks for trying our voice agent',
  '<p>Hi {{first_name}},</p><p>Thanks for trying our voice agent for {{company}}. You can revisit the demo and see how it handles natural business conversations here.</p><p><a href="{{voice_agent_url}}">View the voice agent</a></p>'
FROM email_flows f WHERE f.trigger_key = 'voice_agent_interest'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id AND st.position = 0);

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html, condition_type, condition_step_id)
SELECT f.id, 1, 3, 'support@example.com',
  'Could a voice agent help {{company}}?',
  '<p>Hi {{first_name}},</p><p>If you are still evaluating a voice agent for {{company}}, reply to this email with the calls you want it to handle. We can help you think through the setup.</p><p><a href="{{voice_agent_url}}">Review the voice agent</a></p>',
  'not_clicked', first.id
FROM email_flows f
JOIN email_flow_steps first ON first.flow_id = f.id AND first.position = 0
WHERE f.trigger_key = 'voice_agent_interest'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id AND st.position = 1);

-- Course purchase and upgrade triggers already exist in application code.
-- Give each real course an onboarding journey instead of leaving them empty.
INSERT INTO email_flows (name, trigger_key, course_id, active, purpose, goal_type)
SELECT c.title || ' new PRO learner onboarding', 'course_purchase', c.id, true, 'service', 'course_completed'
FROM courses c WHERE c.published = true AND (c.price_inr IS NOT NULL OR c.price_usd IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM email_flows f WHERE f.trigger_key = 'course_purchase' AND f.course_id = c.id AND f.archived_at IS NULL);

INSERT INTO email_flows (name, trigger_key, course_id, active, purpose, goal_type)
SELECT c.title || ' PRO upgrade onboarding', 'course_upgrade_to_pro', c.id, true, 'service', 'course_completed'
FROM courses c WHERE c.published = true
  AND EXISTS (SELECT 1 FROM course_modules m WHERE m.course_id = c.id AND m.tier = 'free')
  AND EXISTS (SELECT 1 FROM course_modules m WHERE m.course_id = c.id AND m.tier = 'pro')
  AND NOT EXISTS (SELECT 1 FROM email_flows f WHERE f.trigger_key = 'course_upgrade_to_pro' AND f.course_id = c.id AND f.archived_at IS NULL);

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT f.id, 0, 1, 'academy@example.com',
  'How to get the most from {{course_title}}',
  '<p>Hi {{first_name}},</p><p>Your full access to {{course_title}} is ready. Start with the next unfinished lesson and keep a steady pace rather than trying to finish everything at once.</p><p><a href="{{course_url}}">Continue the course</a></p>'
FROM email_flows f WHERE f.trigger_key IN ('course_purchase','course_upgrade_to_pro')
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id AND st.position = 0);

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html, condition_type, condition_step_id)
SELECT f.id, 1, 4, 'academy@example.com',
  'Need help starting {{course_title}}?',
  '<p>Hi {{first_name}},</p><p>If you have not started yet, open {{course_title}} and choose one lesson to complete today. Reply to this email if something is blocking you.</p><p><a href="{{course_url}}">Open the course</a></p>',
  'not_clicked', first.id
FROM email_flows f
JOIN email_flow_steps first ON first.flow_id = f.id AND first.position = 0
WHERE f.trigger_key IN ('course_purchase','course_upgrade_to_pro')
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id AND st.position = 1);

-- Expand the useful one-email starter journeys into restrained sequences.
INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT f.id, 1, 3, 'hello@example.com',
  'What would be most useful to you?',
  '<p>Hi {{first_name}},</p><p>We cover practical marketing systems, courses, tools, and experiments. Choose the topics that help your current work and ignore the rest.</p><p><a href="/blog">Browse the latest resources</a></p>'
FROM email_flows f WHERE f.trigger_key = 'newsletter_signup'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id AND st.position = 1);

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html, condition_type, condition_step_id)
SELECT f.id, 2, 4, 'hello@example.com',
  'A quick way to find the right resource',
  '<p>Hi {{first_name}},</p><p>If you did not find something useful yet, start with the topic closest to the problem you are solving now.</p><p><a href="/blog">Find a practical guide</a></p>',
  'not_clicked', previous.id
FROM email_flows f
JOIN email_flow_steps previous ON previous.flow_id = f.id AND previous.position = 1
WHERE f.trigger_key = 'newsletter_signup'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id AND st.position = 2);

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html, condition_type, condition_step_id)
SELECT f.id, 1, 4, 'support@example.com',
  'Your first community post can be simple',
  '<p>Hi {{first_name}},</p><p>A short introduction is enough: what you do, what you are working on, and one thing you want help with.</p><p><a href="{{community_url}}">Write your first post</a></p>',
  'not_clicked', first.id
FROM email_flows f JOIN email_flow_steps first ON first.flow_id = f.id AND first.position = 0
WHERE f.trigger_key = 'community_inactivity'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id AND st.position = 1);

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html, condition_type, condition_step_id)
SELECT f.id, 1, 4, 'academy@example.com',
  'One small step in {{course_title}}',
  '<p>Hi {{first_name}},</p><p>You do not need a long study session. Continue with {{current_lesson}} and complete one useful step today.</p><p><a href="{{course_url}}">Resume the course</a></p>',
  'not_clicked', first.id
FROM email_flows f JOIN email_flow_steps first ON first.flow_id = f.id AND first.position = 0
WHERE f.trigger_key = 'course_inactivity'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id AND st.position = 1);

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html, condition_type, condition_step_id)
SELECT f.id, 1, 4, 'academy@example.com',
  'Questions about PRO in {{course_title}}?',
  '<p>Hi {{first_name}},</p><p>If you are unsure whether PRO is useful for you, review the complete curriculum and reply with the outcome you want from the course.</p><p><a href="{{course_url}}">Review the PRO curriculum</a></p>',
  'not_clicked', first.id
FROM email_flows f JOIN email_flow_steps first ON first.flow_id = f.id AND first.position = 0
WHERE f.trigger_key = 'course_enroll_free'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id AND st.position = 1);

-- Owner explicitly requested completed flows to be active. Archived/dead flows
-- remain excluded. Marketing journeys still enforce consent at send time.
UPDATE email_flows SET active = true WHERE archived_at IS NULL;

COMMIT;
