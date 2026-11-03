BEGIN;

-- Free Resources > Prompt Library: a login-gated library of AI prompts,
-- browsable by category with search. Landing page is public/indexable;
-- the actual browse/detail pages require an account (see robots.ts and
-- publicSitePages.ts -- only the landing page is registered there).

CREATE TABLE IF NOT EXISTS prompt_categories (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompts (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES prompt_categories(id),
  description TEXT,
  prompt_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category_id);
CREATE INDEX IF NOT EXISTS idx_prompts_status ON prompts(status);

INSERT INTO prompt_categories (slug, name, sort_order) VALUES
  ('images', 'Image prompts', 0),
  ('videos', 'Video prompts', 1),
  ('agents', 'Agent prompts', 2)
ON CONFLICT (slug) DO NOTHING;

-- A few starter prompts so the library isn't empty on first launch. The
-- owner can edit/replace/delete these from /console/prompt-library.
INSERT INTO prompts (slug, title, category_id, description, prompt_text, status)
SELECT * FROM (VALUES
  ('cinematic-product-shot', 'Cinematic product shot',
    (SELECT id FROM prompt_categories WHERE slug = 'images'),
    'A moody, studio-lit product photo prompt for Midjourney/DALL-E style tools.',
    'A cinematic product photograph of {product}, dramatic studio lighting, dark reflective surface, shallow depth of field, high detail, 85mm lens, photorealistic, 4k',
    'published'),
  ('talking-head-explainer', 'Talking-head explainer scene',
    (SELECT id FROM prompt_categories WHERE slug = 'videos'),
    'A short-form talking-head video prompt for AI video generators.',
    'A confident presenter speaking directly to camera in a modern home office, natural daylight, subtle background blur, upbeat but calm tone, 15 seconds, vertical 9:16',
    'published'),
  ('customer-support-agent', 'Customer support triage agent',
    (SELECT id FROM prompt_categories WHERE slug = 'agents'),
    'A system prompt for an AI agent that triages incoming support requests.',
    'You are a support triage agent for {business_name}. Read the customer message, classify it as billing, technical, or general, extract the customer''s core question in one sentence, and suggest the single next best action. Never invent policy details you do not have.',
    'published')
) AS seed(slug, title, category_id, description, prompt_text, status)
WHERE NOT EXISTS (SELECT 1 FROM prompts);

COMMIT;
