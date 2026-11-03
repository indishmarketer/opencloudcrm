-- Generic sitewide key/value settings table, same simple pattern as
-- voice_agent_settings (migration 029). First use: the early-bird promo
-- banner, owner-editable from /console/site-settings without a code
-- change or redeploy for future changes (new course, different offer,
-- turning it off).

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Off and empty on a fresh install; turn it on from /console/site-settings.
INSERT INTO site_settings (key, value) VALUES
  ('promo_banner_enabled', 'false'),
  ('promo_banner_text', ''),
  ('promo_banner_link', '/'),
  ('promo_banner_version', '1')
ON CONFLICT (key) DO NOTHING;
