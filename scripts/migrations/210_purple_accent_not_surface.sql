-- Correct 209: purple is the accent, not the surface.
--
-- 209 pushed purple into inkGradient, which paints the hero and every
-- dark band. A full-bleed purple surface reads heavy and cheap, and it
-- buried the accent, because a purple button on a purple background has
-- nothing to contrast against. The reference the owner gave (their
-- OpenCloudCRM site) does the opposite: white and near-black surfaces,
-- with purple carrying the logo, the buttons, the highlighted words in
-- the headline and the hover states.
--
-- So the dark gradient goes back to near-black, and purple stays where
-- it does the work:
--   accent      #6d28d9  buttons, links, focus rings, highlighted words
--   accentSoft  #ede9fe  hover washes and tinted surfaces
--   paperSoft   #f7f5ff  a barely-there lilac on alternating sections
--   line        #e7e2f7  hairlines that belong to the palette
--
-- paperGradient keeps a faint lilac drift, matching the reference's very
-- light page wash, rather than the flat grey it had before.
--
-- Read live per request, so no redeploy is needed for the colour half.

BEGIN;

INSERT INTO site_settings (key, value, updated_at)
VALUES (
  'site_theme',
  '{
    "ink": "#0f0a1a",
    "paper": "#ffffff",
    "paperSoft": "#f7f5ff",
    "inkSoft": "#4a4458",
    "line": "#e7e2f7",
    "accent": "#6d28d9",
    "accentOn": "#ffffff",
    "accentSoft": "#ede9fe",
    "inkGradient": { "from": "#0a0a0a", "via": "#1a1424", "to": "#0a0a0a", "angle": 160 },
    "paperGradient": { "from": "#ffffff", "via": "#faf8ff", "to": "#f1ecfd", "angle": 160 }
  }'::jsonb::text,
  now()
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;
