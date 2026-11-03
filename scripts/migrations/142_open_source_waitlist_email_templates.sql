-- Allow 'open_source' as a source in contacts table
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_source_check
  CHECK (source = ANY (ARRAY['synced', 'manual', 'import', 'guide', 'open_source']));

-- Seed email templates for the temporary /open-source waitlist.
-- Fully editable by the owner in the console at /console/email/templates.

INSERT INTO email_templates (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars) VALUES
(
  'open-source-otp',
  'open-source',
  'Open source waitlist verification (OTP)',
  'Sent when a visitor requests to join the open source waitlist, containing a 6-digit verification code and magic link.',
  $s$Confirm your email for the open source repo$s$,
  $b$<p>Your 6-digit confirmation code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">{{code}}</p><p>Or click below to confirm your interest immediately:</p><p><a href="{{magic_link_url}}">Confirm email</a></p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>$b$,
  'hello@example.com',
  true,
  true,
  ARRAY['code', 'magic_link_url']
),
(
  'open-source-confirmed',
  'open-source',
  'Open source waitlist confirmation (Thank you)',
  'Sent immediately once email is verified, confirming their request for the open source repo is saved.',
  $s$Your interest in the open source repo is saved$s$,
  $b$<p>Hi {{first_name}},</p><p>Your request is saved. We will be in touch soon.</p>$b$,
  'hello@example.com',
  false,
  true,
  ARRAY['first_name', 'name']
)
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  allowed_vars = EXCLUDED.allowed_vars;
