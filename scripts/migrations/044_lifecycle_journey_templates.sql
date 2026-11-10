-- Paused starter journeys for lifecycle events that need owner-reviewed copy.
BEGIN;

INSERT INTO email_flows (name, trigger_key, active, purpose, goal_type)
SELECT 'Newsletter welcome', 'newsletter_signup', false, 'marketing', 'none'
WHERE NOT EXISTS (SELECT 1 FROM email_flows WHERE trigger_key = 'newsletter_signup' AND archived_at IS NULL);

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT f.id, 0, 0, 'hello@example.com',
  'Welcome to the newsletter',
  '<p>Hi {{first_name}},</p><p>Thanks for joining the newsletter.</p><p>You will receive practical updates when we publish something worth sharing.</p>'
FROM email_flows f WHERE f.trigger_key = 'newsletter_signup'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id);

INSERT INTO email_flows (name, trigger_key, active, purpose, goal_type)
SELECT 'Community member -> first post', 'community_inactivity', false, 'service', 'community_first_post'
WHERE NOT EXISTS (SELECT 1 FROM email_flows WHERE trigger_key = 'community_inactivity' AND archived_at IS NULL);

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT f.id, 0, 3, 'support@example.com',
  'Introduce yourself to the community',
  '<p>Hi {{first_name}},</p><p>You are part of this community. When you are ready, introduce yourself or share what you are working on.</p><p><a href="{{community_url}}">Create your first post</a></p>'
FROM email_flows f WHERE f.trigger_key = 'community_inactivity'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id);

INSERT INTO email_flows (name, trigger_key, course_id, active, purpose, goal_type)
SELECT c.title || ' completion follow-up', 'course_completed', c.id, false, 'service', 'none'
FROM courses c WHERE c.published = true
  AND NOT EXISTS (SELECT 1 FROM email_flows f WHERE f.trigger_key = 'course_completed' AND f.course_id = c.id AND f.archived_at IS NULL);

INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT f.id, 0, 0, 'academy@example.com',
  'You completed {{course_title}}',
  '<p>Hi {{first_name}},</p><p>Congratulations on completing {{course_title}}.</p><p><a href="{{course_url}}">Review the course anytime</a></p>'
FROM email_flows f WHERE f.trigger_key = 'course_completed'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps st WHERE st.flow_id = f.id);

COMMIT;
