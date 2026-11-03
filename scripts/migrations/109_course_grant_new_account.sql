-- Email for a course granted from the console to someone who can't log in
-- yet (a contact with no account, or an account never verified). It carries
-- a one-click sign-in link that opens the course.
INSERT INTO email_templates (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars) VALUES
('course-access-granted-new-account', 'courses', 'Access granted by admin (new account)',
 'Sent when an admin grants a course to someone without a usable account. Includes a sign-in link that works for 24 hours.',
 $s$You're in: {{tier_label}} access to {{course_title}}$s$,
 $b$<p>Hi {{first_name}},</p><p>You've been given {{tier_label}} access to <strong>{{course_title}}</strong>. We made an account for you with this email address.</p><p><a href="{{signin_url}}">Sign in and start learning</a></p><p>This link works for 24 hours. After that, go to <a href="/forgot-password">Forgot password</a> to set a password, then sign in any time.</p>$b$,
 'academy@example.com', false, true, ARRAY['first_name','tier_label','course_title','course_url','signin_url'])
ON CONFLICT (key) DO NOTHING;
