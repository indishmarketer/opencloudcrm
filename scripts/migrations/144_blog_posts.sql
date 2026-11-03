-- Blog post content, previously stored only in committed JSON files
-- (src/data/posts-full.json, src/data/posts-index.json). Schema only --
-- no content. Existing rows are backfilled by a one-time, never-committed
-- data migration script run separately.
CREATE TABLE blog_posts (
  id uuid PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  html text NOT NULL,
  excerpt text,
  feature_image text,
  og_image text,
  meta_title text,
  meta_description text,
  category text NOT NULL,
  author_slug text REFERENCES blog_authors(slug),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  published_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_blog_posts_status_published_at ON blog_posts (status, published_at DESC);
CREATE INDEX idx_blog_posts_category ON blog_posts (category);
