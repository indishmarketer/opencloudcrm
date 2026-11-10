-- Form builder v2: standalone URLs, hidden fields, per-form design tokens,
-- optional email-verification step, the seeded Contact form, and the
-- restylable fixed Sign up / Log in form.
--
-- All changes are additive (new nullable/defaulted columns) so existing
-- rows, the deprecated contactForm page-block, and the /api/contact/* routes
-- keep working without any data migration.

-- 1. Shareable slug: a URL-safe identifier the owner sets once, used as the
--    form's /f/<slug> standalone address.  NULL until the owner saves a slug.
ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS slug text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'forms_slug_unique'
  ) THEN
    ALTER TABLE forms ADD CONSTRAINT forms_slug_unique UNIQUE (slug);
  END IF;
END $$;

-- 2. Optional email-verification step: when true, SavedForm collects the
--    visitor's data, sends an OTP to their email, and only records the
--    submission after they confirm it -- the same two-step flow the hardcoded
--    Contact form used privately.  Defaults to false so every existing saved
--    form is unaffected.
ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS verify_email boolean NOT NULL DEFAULT false;

-- 3. Per-form design token bag: a jsonb object the console's Design tab writes
--    to and SavedForm reads from, applying the values as inline styles so they
--    can never be overridden by the site theme or the page it sits in.
--    Empty object = inherit the site's own look (backward-compatible default).
ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS design jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 4. Fixed form flag: true ONLY for forms whose field structure is enforced
--    by core app plumbing (Sign up / Log in). Fixed forms cannot be deleted
--    and their field list cannot be edited, but their header copy, button
--    label, and design styling remain fully customizable.
ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS is_fixed boolean NOT NULL DEFAULT false;

-- 5. Seed the Contact form as an ordinary, fully editable, deletable form record.
--    Skipped if a form with slug='contact' already exists (idempotent).
--    Fields deliberately match the original hardcoded ContactFormBlock so the
--    new record is a drop-in replacement: name (text, required), email (email,
--    required), message (textarea, required).
INSERT INTO forms (name, slug, verify_email, is_fixed, fields, submit_label,
                   heading, intro_text, success_heading, success_text)
SELECT
  'Contact',
  'contact',
  true,
  false,
  '[
    {"key":"name",    "label":"Name",    "type":"text",     "options":"","required":true, "hidden":false,"defaultValue":""},
    {"key":"email",   "label":"Email",   "type":"email",    "options":"","required":true, "hidden":false,"defaultValue":""},
    {"key":"message", "label":"Message", "type":"textarea", "options":"","required":true, "hidden":false,"defaultValue":""}
  ]'::jsonb,
  'Send message',
  'Contact us',
  'Send us a message and we''ll get back to you.',
  'Thanks, got it.',
  'We''ll get back to you shortly.'
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE slug = 'contact');

-- 6. Seed the Sign up / Log in form as a restylable fixed form.
--    Field structure is fixed by core auth logic, but header text and design
--    system styling are fully editable in Console -> Forms.
INSERT INTO forms (name, slug, verify_email, is_fixed, fields, submit_label,
                   heading, intro_text, success_heading, success_text)
SELECT
  'Sign up / Log in',
  'auth',
  false,
  true,
  '[
    {"key":"name",     "label":"Name",     "type":"text",  "options":"","required":true, "hidden":false,"defaultValue":""},
    {"key":"email",    "label":"Email",    "type":"email", "options":"","required":true, "hidden":false,"defaultValue":""},
    {"key":"password", "label":"Password", "type":"text",  "options":"","required":true, "hidden":false,"defaultValue":""},
    {"key":"country",  "label":"Country",  "type":"text",  "options":"","required":true, "hidden":false,"defaultValue":""},
    {"key":"phone",    "label":"Phone",    "type":"phone", "options":"","required":false,"hidden":false,"defaultValue":""}
  ]'::jsonb,
  'Sign up',
  'Create your account',
  'One account for courses and early access to products.',
  'Welcome!',
  ''
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE slug = 'auth');
