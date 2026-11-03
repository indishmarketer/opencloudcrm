-- Blog drafts: a post deployed with "status": "draft" in the data files
-- stays hidden until it is published from /console/blog, which adds a row
-- here. The row's published_at becomes the post's public date.
CREATE TABLE IF NOT EXISTS blog_post_publications (
  slug TEXT PRIMARY KEY,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by TEXT
);
