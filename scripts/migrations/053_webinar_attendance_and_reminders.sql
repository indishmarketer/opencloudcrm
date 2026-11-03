-- Live-style webinar attendance lifecycle and idempotent attendee emails.

ALTER TABLE webinar_access
  ADD COLUMN IF NOT EXISTS attendee_timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS webinar_reminders (
  id BIGSERIAL PRIMARY KEY,
  access_id BIGINT NOT NULL REFERENCES webinar_access(id) ON DELETE CASCADE,
  session_start_at TIMESTAMPTZ NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('24h', '1h', 'follow_up')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(access_id, session_start_at, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_webinar_reminders_access_session
  ON webinar_reminders(access_id, session_start_at);

UPDATE email_templates
SET label = 'Webinar registration confirmation',
    description = 'Sent when someone reserves a webinar session.',
    subject = $s$Your seat is reserved: {{webinar_title}}$s$,
    body_html = $b$<p>Hi {{first_name}},</p><p>Your seat for <strong>{{webinar_title}}</strong> is reserved.</p><p><strong>{{session_date}}</strong><br>{{session_timezone}}<br>Duration: {{duration}}</p><p><a href="{{webinar_url}}">Enter the webinar room</a></p><p>The presentation follows a live timeline. Join on time so you do not miss the beginning.</p>$b$,
    allowed_vars = ARRAY['first_name','webinar_title','webinar_url','session_date','session_timezone','duration']
WHERE key = 'webinar-registration-confirmation';

INSERT INTO email_templates
  (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars)
VALUES
  ('webinar-reminder-24h', 'webinars', 'Webinar reminder, 24 hours',
   'Sent about one day before an attendee webinar session.',
   $s$Tomorrow: {{webinar_title}}$s$,
   $b$<p>Hi {{first_name}},</p><p>Your webinar <strong>{{webinar_title}}</strong> starts tomorrow.</p><p><strong>{{session_date}}</strong><br>{{session_timezone}}<br>Duration: {{duration}}</p><p><a href="{{webinar_url}}">Enter the webinar room</a></p><p>Join on time because the presentation follows a live timeline.</p>$b$,
   'academy@example.com', false, true,
   ARRAY['first_name','webinar_title','webinar_url','session_date','session_timezone','duration']),
  ('webinar-reminder-1h', 'webinars', 'Webinar reminder, 1 hour',
   'Sent about one hour before an attendee webinar session.',
   $s$Starting soon: {{webinar_title}}$s$,
   $b$<p>Hi {{first_name}},</p><p><strong>{{webinar_title}}</strong> starts in about one hour.</p><p><strong>{{session_date}}</strong><br>{{session_timezone}}</p><p><a href="{{webinar_url}}">Enter the webinar room</a></p><p>Please join a few minutes early. The presentation cannot be rewound.</p>$b$,
   'academy@example.com', false, true,
   ARRAY['first_name','webinar_title','webinar_url','session_date','session_timezone','duration']),
  ('webinar-follow-up', 'webinars', 'Webinar follow-up',
   'Sent after an attendee webinar session ends.',
   $s$Thank you for joining {{webinar_title}}$s$,
   $b$<p>Hi {{first_name}},</p><p>Thank you for joining <strong>{{webinar_title}}</strong>.</p><p>If you are ready for the next step, visit the webinar page for the resources and offer shared during the session.</p><p><a href="{{webinar_url}}">View webinar resources</a></p>$b$,
   'academy@example.com', false, true,
   ARRAY['first_name','webinar_title','webinar_url','session_date','session_timezone','duration'])
ON CONFLICT (key) DO NOTHING;
