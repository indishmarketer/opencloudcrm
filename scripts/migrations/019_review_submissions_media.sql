-- Lets submitted reviews carry the same media the curated testimonials in
-- data/reviews.ts have (screenshots gallery, YouTube video review) instead
-- of being text-only.
ALTER TABLE review_submissions ADD COLUMN IF NOT EXISTS screenshots TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE review_submissions ADD COLUMN IF NOT EXISTS youtube_id TEXT;
