-- Closes the loop on webinar Q&A: an owner alert when a question comes in
-- (previously silent), and a reply notification to the attendee once the
-- owner actually answers (previously the reply had no way to reach them at
-- all outside of still being live in the room).

INSERT INTO email_templates
  (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars)
VALUES
  ('webinar-question-owner-alert', 'webinars', 'New question asked (owner alert)',
   'Sent to you whenever an attendee asks a question during a webinar.',
   $s$New question: {{webinar_title}}$s$,
   $b$<p><strong>{{attendee_name}}</strong> ({{attendee_email}}) asked a question during <strong>{{webinar_title}}</strong>:</p><p>{{question_body}}</p><p><a href="{{console_url}}">Reply in console</a></p>$b$,
   'academy@example.com', false, false,
   ARRAY['attendee_name','attendee_email','webinar_title','question_body','console_url']),

  ('webinar-question-answered', 'webinars', 'Your question was answered',
   'Sent to an attendee when the host replies to a question they asked during a webinar.',
   $s${{webinar_title}}: your question was answered$s$,
   $b$<p>Hi {{first_name}},</p><p>You asked:</p><p><em>{{question_body}}</em></p><p>Here's the answer:</p><p>{{answer_body}}</p>$b$,
   'academy@example.com', false, true,
   ARRAY['first_name','webinar_title','question_body','answer_body'])
ON CONFLICT (key) DO NOTHING;
