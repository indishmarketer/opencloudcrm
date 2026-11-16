-- The contact source label an owner writes for each public page (page
-- editor settings, blog post settings, Pages > Sources). Keyed by URL path
-- so it covers every kind of public page the same way: builder pages,
-- course and tool pages, blog posts, meeting and webinar pages. A contact
-- who first signs up on that page gets this label (src/lib/pageSources.ts);
-- it overrides a form's own source when the form is embedded there.
CREATE TABLE IF NOT EXISTS page_sources (
  path TEXT PRIMARY KEY CHECK (path ~ '^/'),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
