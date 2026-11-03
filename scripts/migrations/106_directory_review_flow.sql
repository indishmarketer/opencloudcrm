-- Tools directory review flow: approve / request changes / reject with
-- emails, submitter edits (only when asked), edit requests for live
-- listings, and category descriptions for search.
BEGIN;

-- 1. Review states on a listing.
ALTER TABLE directory_tools DROP CONSTRAINT IF EXISTS directory_tools_status_check;
ALTER TABLE directory_tools ADD CONSTRAINT directory_tools_status_check
  CHECK (status IN ('draft', 'pending', 'changes_requested', 'published', 'rejected'));
ALTER TABLE directory_tools ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE directory_tools ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
-- Set once the submitter has been told their tool is live. NULL on a
-- published user submission means they were never told (approved before
-- this email existed); the console offers to send it.
ALTER TABLE directory_tools ADD COLUMN IF NOT EXISTS approved_email_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_directory_tools_submitter ON directory_tools (submitted_by_user_id) WHERE submitted_by_user_id IS NOT NULL;

-- 2. Edit requests on a live listing. The submitter proposes, an admin
-- approves (changes applied) or declines. One open request per tool.
CREATE TABLE IF NOT EXISTS directory_tool_edits (
  id SERIAL PRIMARY KEY,
  tool_id INTEGER NOT NULL REFERENCES directory_tools(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changes JSONB NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_tool_edits_one_open ON directory_tool_edits (tool_id) WHERE status = 'pending';

-- 3. Emails.
INSERT INTO email_templates (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars) VALUES
('tool-submission-approved', 'community-support', 'Tool submission approved',
 'Sent to the submitter when an admin approves and publishes their tool.',
 $s${{tool_name}} is now live on Indish Marketer$s$,
 $b$<p>Hi {{first_name}},</p><p>Good news. We approved <strong>{{tool_name}}</strong> and it is now live in the Indish Marketer tools directory.</p><p><a href="{{tool_url}}">See your listing</a></p><p>Want to change something later? Open <a href="{{manage_url}}">My tools</a> and send us an edit request.</p><p>Indish Marketer</p>$b$,
 'support@example.com', false, true, ARRAY['first_name','tool_name','tool_url','manage_url']),
('tool-submission-changes-requested', 'community-support', 'Tool submission: changes requested',
 'Sent to the submitter when an admin asks for changes before publishing.',
 $s$A few changes needed for {{tool_name}}$s$,
 $b$<p>Hi {{first_name}},</p><p>Thanks for submitting <strong>{{tool_name}}</strong>. Before we publish it, please make these changes:</p><p>{{note}}</p><p><a href="{{edit_url}}">Update your submission</a></p><p>Once you send it back, we will review it again.</p><p>Indish Marketer</p>$b$,
 'support@example.com', false, true, ARRAY['first_name','tool_name','note','edit_url']),
('tool-submission-rejected', 'community-support', 'Tool submission not accepted',
 'Sent to the submitter when an admin declines their tool.',
 $s$About your {{tool_name}} submission$s$,
 $b$<p>Hi {{first_name}},</p><p>Thanks for submitting <strong>{{tool_name}}</strong>. We reviewed it and won't be adding it to the directory right now.</p><p>{{note}}</p><p>Indish Marketer</p>$b$,
 'support@example.com', false, true, ARRAY['first_name','tool_name','note']),
('tool-edit-approved', 'community-support', 'Tool edit approved',
 'Sent to the submitter when an admin approves their edit request on a live tool.',
 $s$Your changes to {{tool_name}} are live$s$,
 $b$<p>Hi {{first_name}},</p><p>We approved your edit request. The changes to <strong>{{tool_name}}</strong> are now live.</p><p><a href="{{tool_url}}">See your listing</a></p><p>Indish Marketer</p>$b$,
 'support@example.com', false, true, ARRAY['first_name','tool_name','tool_url']),
('tool-edit-rejected', 'community-support', 'Tool edit declined',
 'Sent to the submitter when an admin declines their edit request on a live tool.',
 $s$About your edit to {{tool_name}}$s$,
 $b$<p>Hi {{first_name}},</p><p>We reviewed your edit request for <strong>{{tool_name}}</strong> and kept the listing as it is.</p><p>{{note}}</p><p>You can send a new request any time from <a href="{{manage_url}}">My tools</a>.</p><p>Indish Marketer</p>$b$,
 'support@example.com', false, true, ARRAY['first_name','tool_name','note','manage_url']),
('tool-submission-admin-notify', 'admin', 'Tool directory: needs review (admin)',
 'Sent to the owner when someone submits a tool, sends back changes, or asks to edit a live tool.',
 $s$Tool directory: {{tool_name}} needs review$s$,
 $b$<p>{{submitter_email}} {{event_text}} <strong>{{tool_name}}</strong>.</p><p><a href="{{console_url}}">Review it in the console</a></p>$b$,
 'support@example.com', false, false, ARRAY['submitter_email','event_text','tool_name','console_url'])
ON CONFLICT (key) DO NOTHING;

-- 4. Category descriptions (meta description and page intro) and new categories.
UPDATE directory_categories SET sort_order = 10, description = 'AI agents do multi-step work for you, like research, outreach, and data entry. Compare agent builders and frameworks, both free and paid.' WHERE slug = 'ai-agents';
UPDATE directory_categories SET sort_order = 20, description = 'AI assistants answer questions, write drafts, and help you plan your work. Compare chat assistants for marketing, research, and daily tasks.' WHERE slug = 'ai-assistants';
UPDATE directory_categories SET sort_order = 30, description = 'AI voice agents answer and make phone calls for your business. Compare platforms that book appointments, qualify leads, and handle support calls.' WHERE slug = 'ai-voice-agents';
UPDATE directory_categories SET sort_order = 120, description = 'A CRM keeps your leads, clients, and deals in one place. Compare CRMs for solo marketers, coaches, agencies, and small teams.' WHERE slug = 'crms';
UPDATE directory_categories SET sort_order = 170, description = 'Free APIs give you data and AI features to plug into your own apps and automations. Every API here has a free tier you can start with today.' WHERE slug = 'free-apis';
UPDATE directory_categories SET sort_order = 180, description = 'Paid tools worth the money for marketers and small businesses. Each pick saves you time on scheduling, design, email, or automation.' WHERE slug = 'paid-tools';

INSERT INTO directory_categories (slug, name, description, sort_order) VALUES
('ai-writing-tools', 'AI Writing Tools', 'AI writing tools help you draft blog posts, ads, emails, and social captions faster. Compare tools that keep your voice and cut editing time.', 40),
('ai-image-tools', 'AI Image Tools', 'AI image tools turn a text prompt into pictures for ads, thumbnails, and social posts. Compare image generators by quality, control, and price.', 50),
('ai-video-tools', 'AI Video Tools', 'AI video tools help you make, edit, and repurpose videos without a production team. Compare avatar video, text to video, and short clip tools.', 60),
('ai-coding-tools', 'AI Coding Tools', 'AI coding tools write, fix, and explain code for you. Compare code assistants and app builders that help you ship websites and tools fast.', 70),
('automation-tools', 'Automation Tools', 'Automation tools connect your apps so work moves on its own. Compare tools that move leads, send messages, and update sheets without copy and paste.', 80),
('open-source-tools', 'Open Source Tools', 'Open source tools you can host yourself, often for free. Most link straight to their GitHub repo so you can read the code and run it on your own server.', 90),
('email-marketing', 'Email Marketing', 'Email marketing tools help you grow a list, send newsletters, and run automated sequences. Compare options for creators, coaches, and small businesses.', 100),
('seo-tools', 'SEO Tools', 'SEO tools show what people search for, how your pages rank, and what to fix. Compare free and paid tools for keywords, site audits, and backlinks.', 110),
('social-media-tools', 'Social Media Tools', 'Social media tools help you plan, schedule, and measure posts across every platform from one place. Compare schedulers for creators and brands.', 130),
('website-builders', 'Website Builders', 'Website builders let you launch a site or landing page without writing code. Compare builders for portfolios, coaching sites, and lead pages.', 140),
('analytics-tools', 'Analytics Tools', 'Analytics tools show who visits your site, where they come from, and what they do. Compare free and privacy-friendly ways to track traffic and sales.', 150),
('forms-and-surveys', 'Forms and Surveys', 'Form and survey tools collect leads, feedback, and signups. Compare form builders that look clean, connect to your apps, and are easy to fill in.', 155),
('design-tools', 'Design Tools', 'Design tools help you make graphics, mockups, and brand assets without hiring a designer. Compare free and paid editors for everyday marketing work.', 158),
('payments-and-selling', 'Payments and Selling', 'Payment tools let you take money online for courses, products, and services. Compare checkouts and storefronts for selling in India and worldwide.', 160)
ON CONFLICT (slug) DO NOTHING;


-- 5. Tool listings are this deployment's own directory content, not a
-- generic default -- add listings at /console/directory after install.

COMMIT;
