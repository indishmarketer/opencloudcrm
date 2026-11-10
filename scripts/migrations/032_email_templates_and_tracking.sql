-- Email templates: every hardcoded transactional email becomes a DB-backed,
-- console-editable row. Subject/body support {{var}} placeholders, applied
-- with raw (non-escaping) substitution -- callers must pass already
-- HTML-safe values, exactly like the inline template literals they replace.
--
-- email_events: append-only send/delivery log. Every sendEmail() call
-- inserts a 'sent' or 'failed' row; the open-tracking pixel and (later) the
-- Brevo webhook append 'opened'/'delivered'/'bounced'/etc rows keyed by
-- recipient_email/template_key/message_id.

CREATE TABLE IF NOT EXISTS email_templates (
  key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  from_email TEXT NOT NULL DEFAULT 'hello@example.com',
  critical BOOLEAN NOT NULL DEFAULT false,
  track_opens BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_events (
  id SERIAL PRIMARY KEY,
  template_key TEXT,
  category TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  message_id TEXT,
  event TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_events_recipient ON email_events(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_events_message_id ON email_events(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_events_template ON email_events(template_key) WHERE template_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_events_created ON email_events(created_at);
CREATE INDEX IF NOT EXISTS idx_email_events_event ON email_events(event);

INSERT INTO email_templates (key, category, label, description, subject, body_html, from_email, critical, track_opens) VALUES

('otp-code', 'security', 'Verification code (OTP)',
 'Sent whenever someone requests a 6-digit code (contact form, login, etc).',
 $s$Your verification code: {{code}}$s$,
 $b$<p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">{{code}}</p><p>This code expires in 10 minutes. If you didn't request this, ignore it.</p>$b$,
 'hello@example.com', true, true),

('password-reset', 'security', 'Password reset link',
 'Sent when someone requests a password reset from the login page.',
 $s$Reset your password$s$,
 $b$<p>Hi {{first_name}},</p><p>Click the link below to reset your password. This link expires in 30 minutes.</p><p><a href="{{reset_url}}">Reset password</a></p><p>If you didn't request this, you can ignore this email.</p>$b$,
 'hello@example.com', true, true),

('magic-link-login', 'security', 'Console login link',
 'Sent to a console admin requesting a passwordless login link.',
 $s$Your console login link$s$,
 $b$<p>Click below to log in to the {{site_name}} console.</p><p><a href="{{link}}">Log in</a></p><p>This link expires in 15 minutes. If you didn't request this, ignore it.</p>$b$,
 'hello@example.com', true, true),

('email-verification', 'security', 'Confirm your email',
 'Sent right after signup, and again if the visitor asks to resend it.',
 $s$Confirm your email to get started$s$,
 $b$<p>Hi {{first_name}},</p><p>One step left — confirm this is your email to activate your account.</p><p><a href="{{verify_url}}">Confirm email &amp; continue</a></p><p>This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>$b$,
 'hello@example.com', true, false),

('console-admin-invite', 'admin', 'Console admin invite',
 'Sent when an existing console admin adds a new one.',
 $s$You've been added to the {{site_name}} console$s$,
 $b$<p>{{invited_by}} gave you access to the {{site_name}} console.</p><p><a href="{{login_url}}">Log in</a> with this email address to get a one-time link, no password needed.</p>$b$,
 'hello@example.com', false, true),

('author-application-admin-notify', 'admin', 'New author application (admin alert)',
 'Sent to the admin inbox when someone applies to write for the blog.',
 $s$New author application from {{applicant_email}}$s$,
 $b$<p><strong>{{applicant_email}}</strong> applied to write for the blog:</p><p>{{topics}}</p>{{sample_block}}$b$,
 'hello@example.com', false, false),

('author-application-approved', 'admin', 'Author application approved',
 'Sent to the applicant when a console admin approves their author application.',
 $s$You're in — writing for {{site_name}}$s$,
 $b$<p>Hi {{name}},</p><p>Good news, we'd love to have you write for the {{site_name}} blog. Reply to this email and we'll get you set up with a topic and next steps.</p><p>— {{site_name}}</p>$b$,
 'hello@example.com', false, true),

('author-application-rejected', 'admin', 'Author application rejected',
 'Sent to the applicant when a console admin rejects their author application.',
 $s$Your author application$s$,
 $b$<p>Hi {{name}},</p><p>Thanks for applying to write for the {{site_name}} blog. We're not able to take you on right now, but we'll keep your application on file.</p><p>— {{site_name}}</p>$b$,
 'hello@example.com', false, true),

('contact-form-admin-notify', 'community-support', 'New contact form message (admin alert)',
 'Sent to the admin inbox when a visitor submits the contact form.',
 $s$New contact form message from {{name}}$s$,
 $b$<p><strong>{{name}}</strong> ({{email}}) wrote:</p><p>{{message}}</p>$b$,
 'hello@example.com', false, false),

('contact-form-reply', 'community-support', 'Reply to a contact form message',
 'Sent when a console admin replies to someone who submitted the contact form.',
 $s$Re: your message to {{site_name}}$s$,
 $b$<p>Hi {{name}},</p><p>{{message}}</p><p>— {{site_name}}</p>$b$,
 'hello@example.com', false, true),

('review-submitted-admin-notify', 'community-support', 'New review submitted (admin alert)',
 'Sent to the admin inbox when someone submits a review.',
 $s$New review submitted by {{name}}$s$,
 $b$<p><strong>{{name}}</strong> ({{role}}) left a {{rating}}-star review:</p><p>{{message}}</p>$b$,
 'hello@example.com', false, false),

('review-question-to-author', 'community-support', 'Question about a submitted review',
 'Sent when a console admin asks the reviewer a question before publishing.',
 $s$A quick question about your review$s$,
 $b$<p>Hi {{name}},</p><p>Thanks for leaving a review for {{site_name}}. Before we publish it, we had a quick question:</p><p>{{note}}</p><p>Just reply to this email and we'll take another look.</p>$b$,
 'hello@example.com', false, true),

('payment-claim-admin-notify', 'community-support', 'New payment claim (admin alert)',
 'Sent to the admin inbox when someone submits a manual payment claim.',
 $s$New payment claim awaiting review$s$,
 $b$<p>{{email}} submitted a {{method}} payment claim (ref: {{reference}}). Review it in the console.</p>$b$,
 'hello@example.com', false, false),

('razorpay-unmatched-payment-alert', 'payments-alerts', 'Razorpay payment could not be matched',
 'Sent to support@ when a Razorpay webhook payment has no valid signed purchase token.',
 $s$Razorpay payment could not be auto-matched to a course$s$,
 $b$<p>A Razorpay payment came in that couldn't be matched to a user/course automatically.</p>
        <p>Payment ID: {{payment_id}}<br>Payer email: {{payer_email}}<br>Reason: missing or invalid signed purchase token.</p>
        <p>Check <a href="/console/courses">/console/courses</a> to manually grant access if this was a real payment.</p>$b$,
 'academy@example.com', false, false),

('payment-grant-failed-alert', 'payments-alerts', 'URGENT: payment succeeded but access grant failed',
 'Sent to the admin when a Razorpay/PayPal payment succeeded but the DB transaction granting course access threw an error.',
 $s$URGENT: {{provider}} payment succeeded but access grant/logging failed$s$,
 $b$<p>{{payer_email}} paid for {{course_title}} ({{ref_label}} {{payment_ref}}, {{amount}} {{currency}}) but the transaction threw an error. Grant it manually via /console/courses.</p>$b$,
 'hello@example.com', true, false),

('course-access-granted-pro', 'courses', 'PRO access granted (payment success)',
 'Sent immediately after a successful Razorpay or PayPal payment.',
 $s$You're in: PRO access to {{course_title}}$s$,
 $b$<p>Hi {{first_name}},</p><p>Your payment went through — you now have full PRO access to {{course_title}}.</p><p><a href="{{course_url}}">Start learning</a></p>$b$,
 'academy@example.com', false, true),

('course-access-granted-free', 'courses', 'Free access granted (self-enroll)',
 'Sent when someone self-enrolls in a free course.',
 $s$You're in: {{course_title}}$s$,
 $b$<p>Hi {{first_name}},</p><p>You now have free access to {{course_title}}.</p><p><a href="{{course_url}}">Start learning</a></p>$b$,
 'academy@example.com', false, true),

('course-access-granted-manual', 'courses', 'Access granted manually by admin',
 'Sent when a console admin manually grants or sets a user''s course tier.',
 $s$You're in: {{tier_label}} access to {{course_title}}$s$,
 $b$<p>Hi {{first_name}},</p><p>You've been given {{tier_label}} access to {{course_title}}.</p><p><a href="{{course_url}}">Start learning</a></p>$b$,
 'academy@example.com', false, true),

('course-access-granted-claim-approved', 'courses', 'PRO access granted (manual payment claim approved)',
 'Sent when a console admin approves a manually submitted payment claim.',
 $s$You're in: PRO access to {{course_title}}$s$,
 $b$<p>Hi {{first_name}},</p><p>Your payment has been verified — you now have full PRO access to {{course_title}}.</p><p><a href="{{course_url}}">Start learning</a></p>$b$,
 'academy@example.com', false, true),

('course-access-upgraded', 'courses', 'Upgraded from free to PRO',
 'Sent when a console admin upgrades an existing free enrollment to PRO.',
 $s$You're now PRO: {{course_title}}$s$,
 $b$<p>Hi {{first_name}},</p><p>Your access to {{course_title}} has been upgraded to full PRO.</p><p><a href="{{course_url}}">Start learning</a></p>$b$,
 'academy@example.com', false, true)

ON CONFLICT (key) DO NOTHING;
