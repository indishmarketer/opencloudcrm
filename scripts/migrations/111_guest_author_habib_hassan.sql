-- Guest author for "After the Export" (2026-10). Bio and link are from the
-- author note he supplied with the draft.
INSERT INTO blog_authors (slug, name, role, bio, avatar_url, social_links, is_active)
VALUES (
  'habib-hassan',
  'Habib Hassan',
  'Founder, Repostit',
  'Habib Hassan is the founder of Repostit, a service for publishing finished video content to connected social accounts.',
  NULL,
  '[{"label": "Repostit", "url": "https://repostit.io/"}]'::jsonb,
  true
)
ON CONFLICT (slug) DO NOTHING;
