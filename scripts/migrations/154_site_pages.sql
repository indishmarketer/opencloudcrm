-- Page builder: every editable page is one row of ordered "blocks"
-- (sections), defined in src/lib/pageBlocks.ts.
--
-- kind = 'page'   -> a public page at `path` ("/", "/about", "/pricing"...).
--                    Built-in routes (/courses, /terms...) only get a row once
--                    someone edits them; until then they render their code
--                    defaults (src/lib/sitePages.ts).
-- kind = 'course' -> extra sections on a course's sales page, ref_id = courses.id
-- kind = 'tool'   -> extra sections on a directory tool's page, ref_id = tool id
--
-- `blocks` (+ title/meta columns) is the working copy the editor saves into;
-- `published` is the snapshot visitors see, copied from the working copy on
-- Publish. Editing a live page never shows half-finished work.
--
-- No content is seeded here on purpose: a fresh install gets neutral starter
-- pages created by the app on first use (src/lib/starterPages.ts), so this
-- public repo never carries any one business's own copy.

CREATE TABLE IF NOT EXISTS site_pages (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'page' CHECK (kind IN ('page', 'course', 'tool')),
  path TEXT,
  ref_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  meta_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  og_image TEXT NOT NULL DEFAULT '',
  noindex BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  published JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  updated_by TEXT,
  CONSTRAINT site_pages_page_has_path CHECK (kind <> 'page' OR path IS NOT NULL),
  CONSTRAINT site_pages_entity_has_ref CHECK (kind = 'page' OR ref_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS site_pages_path_key ON site_pages (path) WHERE kind = 'page';
CREATE UNIQUE INDEX IF NOT EXISTS site_pages_entity_key ON site_pages (kind, ref_id) WHERE kind <> 'page';
