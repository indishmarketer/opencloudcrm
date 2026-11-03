-- Alt text for directory screenshots, keyed by image URL so it survives
-- screenshots being reordered or removed.
ALTER TABLE directory_tools ADD COLUMN IF NOT EXISTS screenshot_alts JSONB NOT NULL DEFAULT '{}'::jsonb;
