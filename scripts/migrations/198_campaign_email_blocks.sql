-- Preserve visual composer layouts when a campaign is saved and reopened.
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS blocks_json jsonb;
