-- Tracks which blog post (if any) a campaign was generated from, so the
-- console can warn before a post gets emailed as a newsletter twice.
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS source_post_slug TEXT;
