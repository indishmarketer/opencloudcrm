-- Seed an EXAMPLE guide for the homepage "Get the free guide" popup, so a
-- fresh console shows what a lead magnet looks like -- seeded UNPUBLISHED
-- (a previous version of this seed published it immediately with marketing
-- copy specific to the original project maintainer's own automation-agency
-- business, which would show on every fresh install's homepage regardless
-- of the deploying business's actual niche). The business can edit this
-- example or replace it with their own, then publish it, from
-- /console/lead-magnets. Until something is published, the homepage's
-- "leadMagnet" button action falls back to a plain link automatically.
INSERT INTO lead_magnets (slug, title, headline, subheadline, cover_image_url, file_url, published)
VALUES (
  'example-starter-guide',
  'Example Starter Guide',
  'Replace this with your own free guide',
  'Edit this lead magnet from Console -> Lead magnets: give it your own title, headline, cover image and PDF, then publish it.',
  '',
  '',
  false
);
