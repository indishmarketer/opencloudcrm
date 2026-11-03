-- Seeds the email_templates row sent to leads captured via the inbound
-- webhook (/api/webhooks/open-cloud-crm). Only a generic placeholder is
-- seeded here, deliberately: this repo is a public, self-hostable product,
-- and a committed migration is the one thing every self-hoster's install
-- runs by default. Real sender/subject/body for this specific deployment
-- are set directly in the live database via the console at
-- /console/email/templates (or the update_email_template API), never
-- committed to source control.

INSERT INTO email_templates (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars) VALUES
(
  'open-cloud-crm-welcome',
  'open-cloud-crm',
  'Open Cloud CRM welcome',
  'Sent once, the first time a lead signs up through the Open Cloud CRM landing page webhook.',
  $s$Thanks for signing up$s$,
  $b$<p>Hi {{first_name}},</p><p>Thanks for signing up. We will be in touch soon.</p>$b$,
  'hello@example.com',
  false,
  true,
  ARRAY['first_name']
)
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  allowed_vars = EXCLUDED.allowed_vars;
