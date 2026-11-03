BEGIN;

-- Dedicated, shareable pages inside the Prompt & Skill Library for a
-- specific YouTube video or public post: one embedded video, an
-- explanation, and a hand-picked, ordered set of existing prompts/skills
-- (each with an optional video timestamp and its own instruction), so the
-- owner can share ONE link from a video description or LinkedIn post and
-- land visitors on exactly the resources for that piece of content --
-- separate from the general-purpose browse/search library.

CREATE TABLE IF NOT EXISTS prompt_guides (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_guide_items (
  id SERIAL PRIMARY KEY,
  guide_id INTEGER NOT NULL REFERENCES prompt_guides(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  item_type TEXT NOT NULL CHECK (item_type IN ('prompt', 'skill')),
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE CASCADE,
  skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
  timestamp_label TEXT,
  instruction TEXT,
  CHECK (
    (item_type = 'prompt' AND prompt_id IS NOT NULL AND skill_id IS NULL) OR
    (item_type = 'skill' AND skill_id IS NOT NULL AND prompt_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_prompt_guide_items_guide ON prompt_guide_items(guide_id, position);

COMMIT;
