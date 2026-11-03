-- Seed guide for the homepage "Get the free guide" popup -- a real,
-- useful short PDF (not a placeholder), published immediately so the
-- flow works end to end from launch. The owner can edit/replace it any
-- time from /console/lead-magnets.
INSERT INTO lead_magnets (slug, title, headline, subheadline, cover_image_url, file_url, published)
VALUES (
  'indie-automation-starter-guide',
  'The Indie Automation Starter Guide',
  '3 automations that save solo businesses hours every week',
  'A short, practical guide to capturing leads automatically, following up without lifting a finger, and keeping your CRM in sync. No fluff.',
  'https://images.indishmarketer.com/lead-magnets/indie-automation-starter-guide-cover.webp',
  'https://images.indishmarketer.com/lead-magnets/indie-automation-starter-guide.pdf',
  true
);
