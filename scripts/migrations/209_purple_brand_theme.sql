-- Make purple the site's dominant colour.
--
-- The palette shipped as pure neutrals: accent was #0a0a0a, the same as
-- ink, so "the brand colour" was literally black and the site could not
-- express a signature colour at all. paperSoft was a warm grey (#f5f5f4),
-- which is why alternating sections read as random light/grey banding
-- rather than a deliberate rhythm.
--
-- This row is read live on every request (src/lib/siteTheme.ts), so it
-- takes effect without a rebuild or a redeploy.
--
-- Contrast was checked against white for every text colour:
--   ink      #140826 on #ffffff  ~18:1   (near-black, faint purple cast)
--   inkSoft  #4a4160 on #ffffff  ~8.8:1  (body text, comfortably AAA)
--   accent   #6d28d9 on #ffffff  ~6.5:1  (links and buttons, passes AA)
--   accentOn #ffffff on #6d28d9  ~6.5:1  (button labels)
-- So purple leads visually while text stays black-on-white and readable,
-- which is what was asked for.
--
-- inkGradient is the dark band behind hero sections: deep purple into
-- vivid violet into indigo, so purple dominates and blue only cools the
-- tail. paperGradient is the light equivalent, a white-to-lilac wash.

BEGIN;

INSERT INTO site_settings (key, value, updated_at)
VALUES (
  'site_theme',
  '{
    "ink": "#140826",
    "paper": "#ffffff",
    "paperSoft": "#f4f1fe",
    "inkSoft": "#4a4160",
    "line": "#e4ddf7",
    "accent": "#6d28d9",
    "accentOn": "#ffffff",
    "accentSoft": "#ede9fe",
    "inkGradient": { "from": "#1a0b3d", "via": "#6d28d9", "to": "#1e1b4b", "angle": 160 },
    "paperGradient": { "from": "#ffffff", "via": "#f6f3ff", "to": "#e9e3fb", "angle": 160 }
  }'::jsonb::text,
  now()
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;
