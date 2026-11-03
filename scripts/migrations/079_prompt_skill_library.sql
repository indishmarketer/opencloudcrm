BEGIN;

-- Owner feedback 2026-09-20: expand into a shared "Prompt & Skill
-- Library". Prompts and a new "skills" content type (downloadable,
-- copyable SKILL.md-style files) share the same category taxonomy
-- instead of each getting their own separate category set.

INSERT INTO prompt_categories (slug, name, sort_order) VALUES
  ('coding', 'Coding', 3),
  ('marketing', 'Marketing', 4)
ON CONFLICT (slug) DO NOTHING;

-- Category names drop the "prompts" suffix now that a category can hold
-- skills too, not just prompts.
UPDATE prompt_categories SET name = 'Images' WHERE slug = 'images';
UPDATE prompt_categories SET name = 'Video' WHERE slug = 'videos';
UPDATE prompt_categories SET name = 'Agents' WHERE slug = 'agents';

CREATE TABLE IF NOT EXISTS skills (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES prompt_categories(id),
  description TEXT,
  skill_markdown TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category_id);
CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);

COMMIT;
