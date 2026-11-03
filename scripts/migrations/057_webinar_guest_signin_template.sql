-- Passwordless webinar registration: the "click to enter" email sent
-- instead of the old password-based signup + separate email-verification
-- flow. Reuses the existing email-verification token mechanism under the
-- hood (src/lib/auth.ts createEmailVerificationToken/verifyEmailVerificationToken),
-- which already creates a session and redirects on click -- this template
-- is just the console-editable copy for that specific entry point.

INSERT INTO email_templates
  (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars)
VALUES
  ('webinar-guest-signin', 'webinars', 'Webinar guest sign-in link',
   'Sent when someone registers for a free webinar without an existing account -- clicking the link signs them in and drops them straight into the webinar, no password involved.',
   $s$Enter {{webinar_title}}$s$,
   $b$<p>Hi {{first_name}},</p><p>Click below to enter <strong>{{webinar_title}}</strong>. No password needed -- this link signs you in.</p><p><a href="{{verify_url}}">Enter the webinar</a></p><p>This link expires in 24 hours. If you didn't request this, you can ignore this email.</p>$b$,
   'academy@example.com', false, true,
   ARRAY['first_name','webinar_title','verify_url'])
ON CONFLICT (key) DO NOTHING;
