-- Previously a failed video upload/transcode (Mux video.asset.errored) set
-- status='errored' with no alert at all -- the owner would only find out by
-- happening to check the console. Meetings has an equivalent alert for its
-- own failure class; this closes the same gap for webinars.

INSERT INTO email_templates
  (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars)
VALUES
  ('webinar-processing-failed-alert', 'webinars', 'Video processing failed (owner alert)',
   'Sent to you when a webinar video upload fails to process.',
   $s$Video processing failed: {{webinar_title}}$s$,
   $b$<p>The video for <strong>{{webinar_title}}</strong> failed to process and could not be published.</p><p>Try uploading it again from <a href="{{console_url}}">the console</a>. If it keeps failing, check the file format and size.</p>$b$,
   'academy@example.com', false, false,
   ARRAY['webinar_title','console_url'])
ON CONFLICT (key) DO NOTHING;
