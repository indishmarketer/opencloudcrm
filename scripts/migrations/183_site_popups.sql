-- Popups as a first-class thing an owner designs, not a hardcoded dialog.
--
-- A popup is a named collection of ordinary page elements -- headline,
-- paragraph, image, video, button, an embedded form -- held in the same
-- `blocks` jsonb shape site_pages uses. That is deliberate: it means every
-- element type, every style field and the whole renderer work inside a
-- popup on day one, and anything added to the page builder later shows up
-- here too, instead of a parallel popup-only element system drifting apart
-- from the real one (the exact failure mode that left Full name / Date
-- missing from the form palette).
--
-- `settings` holds the popup's own chrome: width, padding, corner radius,
-- background and overlay, which belong to the dialog rather than to any
-- element inside it.

BEGIN;

CREATE TABLE IF NOT EXISTS site_popups (
  id serial PRIMARY KEY,
  name text NOT NULL,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_popups_updated ON site_popups (updated_at DESC);

COMMENT ON COLUMN site_popups.blocks IS
  'Ordered page elements, same shape as site_pages.blocks. Only element-group (nestable) types are allowed -- a popup holds elements, not full-width page sections.';
COMMENT ON COLUMN site_popups.settings IS
  'The dialog chrome: maxWidth, padding, borderRadius, backgroundColor, overlayOpacity. Elements inside carry their own styles as usual.';

COMMIT;
