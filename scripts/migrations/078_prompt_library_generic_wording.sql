BEGIN;

-- Owner feedback 2026-09-20: don't name specific AI models/products in
-- prompt descriptions (they go stale fast, and one named model, DALL-E,
-- is already discontinued by OpenAI). Use generic category language.
UPDATE prompts
SET description = 'A moody, studio-lit product photo prompt for AI image generators.'
WHERE slug = 'cinematic-product-shot';

UPDATE prompts
SET description = 'A short-form talking-head video prompt for AI video generators.'
WHERE slug = 'talking-head-explainer';

COMMIT;
