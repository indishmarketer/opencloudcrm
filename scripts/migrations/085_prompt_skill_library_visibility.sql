BEGIN;

-- Owner feedback 2026-09-20: prompts/skills created to support a specific
-- guide (e.g. follow-up prompts from one YouTube video) shouldn't
-- automatically show up in the general browse library, where they have no
-- context and just confuse visitors. Default true so every existing
-- prompt/skill keeps showing exactly as before; new guide-only items are
-- created with this explicitly false from the console.

ALTER TABLE prompts ADD COLUMN IF NOT EXISTS show_in_library BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS show_in_library BOOLEAN NOT NULL DEFAULT true;

COMMIT;
