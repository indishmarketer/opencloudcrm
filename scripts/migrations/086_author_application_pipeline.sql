-- Author applications currently stop dead at "approved" -- one email saying
-- "reply to this email", then nothing tracked. This gives the flow real
-- stages (draft requested -> submitted -> changes requested -> accepted)
-- with a shareable-link field for the draft (Google Doc/Notion/etc, no
-- editor needed) and a field for social links collected after acceptance.
-- Replies still land in the owner's personal inbox as before -- no inbound
-- email capture, by explicit choice, to avoid building unneeded infra.
--
-- Also adds blog_authors: a real table for guest-author profiles (name,
-- bio, avatar, socials), since the blog only has one hardcoded author today
-- and there's nowhere to put a second one. Publishing itself stays manual
-- (posts are static JSON files, not DB-driven) -- this table just gives the
-- console somewhere to build the profile before that manual step.

BEGIN;

ALTER TABLE author_applications DROP CONSTRAINT IF EXISTS author_applications_status_check;
ALTER TABLE author_applications ADD CONSTRAINT author_applications_status_check
  CHECK (status IN ('pending', 'approved', 'draft_submitted', 'changes_requested', 'accepted', 'rejected'));

ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS submission_url TEXT;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS submission_note TEXT;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS social_links TEXT;

CREATE TABLE IF NOT EXISTS blog_authors (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  bio TEXT,
  avatar_url TEXT,
  social_links TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  application_id INTEGER REFERENCES author_applications(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE author_applications ADD COLUMN IF NOT EXISTS blog_author_id INTEGER REFERENCES blog_authors(id) ON DELETE SET NULL;

-- Point the existing "approved" email at the real next step (submit a
-- draft link) instead of "reply to this email".
UPDATE email_templates SET
  subject = $s$You're in — next step for your Indish Marketer post$s$,
  body_html = $b$<p>Hi {{name}},</p><p>Good news, we'd love to have you write for the Indish Marketer blog.</p><p>Next step: write your piece anywhere with a shareable link (Google Docs, Notion, whatever you use), then submit that link here:</p><p><a href="{{submit_url}}">{{submit_url}}</a></p><p>We'll read it and get back to you.</p><p>— Indish Marketer</p>$b$,
  allowed_vars = ARRAY['name','submit_url'],
  updated_at = now()
WHERE key = 'author-application-approved';

INSERT INTO email_templates (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars) VALUES
('author-application-changes-requested', 'admin', 'Author application: changes requested',
 'Sent to the applicant when a console admin asks for changes to their submitted draft.',
 $s$Quick changes needed on your draft$s$,
 $b$<p>Hi {{name}},</p><p>Thanks for submitting your draft. Before we move forward:</p><p>{{note}}</p><p>Once it's updated, resubmit your link here:</p><p><a href="{{submit_url}}">{{submit_url}}</a></p><p>— Indish Marketer</p>$b$,
 'support@example.com', false, true, ARRAY['name','note','submit_url']),

('author-application-draft-accepted', 'admin', 'Author application: draft accepted',
 'Sent to the applicant when a console admin accepts their submitted draft.',
 $s$Your draft is a go$s$,
 $b$<p>Hi {{name}},</p><p>Your draft looks great, we'd love to publish it.</p><p>Last step: send us your social links (X, LinkedIn, Instagram, website, whatever you want credited) here:</p><p><a href="{{submit_url}}">{{submit_url}}</a></p><p>We'll be in touch once it's live.</p><p>— Indish Marketer</p>$b$,
 'support@example.com', false, true, ARRAY['name','submit_url']),

('author-application-progress-admin-notify', 'admin', 'Author application progress (admin alert)',
 'Sent to the owner inbox whenever an applicant advances their own author application (submits a draft link, resubmits after changes, or adds social links).',
 $s${{applicant_email}} updated their author application$s$,
 $b$<p><strong>{{applicant_email}}</strong> {{event_text}}.</p><p><a href="{{console_url}}">Review in console</a></p>$b$,
 'owner@example.com', false, false, ARRAY['applicant_email','event_text','console_url'])

ON CONFLICT (key) DO NOTHING;

COMMIT;
