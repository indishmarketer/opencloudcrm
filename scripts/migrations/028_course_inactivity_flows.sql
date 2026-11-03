-- Seed default Course Inactivity flow for existing courses so owner has a pre-configured template.
-- Trigger: course_inactivity (course-scoped)
-- Can be customized or duplicated via /console/automation

INSERT INTO email_flows (name, trigger_key, course_id, active)
SELECT 'Course Inactivity Nudge - ' || title, 'course_inactivity', id, false
FROM courses
ON CONFLICT DO NOTHING;

-- Seed initial step for inactivity flows (delay_days: 3)
INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html)
SELECT f.id, 0, 3, 'academy@example.com',
  'Pick up where you left off: {{course_title}}',
  '<p>Hi {{first_name}},</p><p>You''re {{completed_lessons}} of {{total_lessons}} lessons into {{course_title}} -- your access doesn''t expire, so whenever you''re ready, jump back in.</p><p><a href="{{course_url}}">Continue the course</a></p>'
FROM email_flows f
WHERE f.trigger_key = 'course_inactivity'
  AND NOT EXISTS (SELECT 1 FROM email_flow_steps s WHERE s.flow_id = f.id);
