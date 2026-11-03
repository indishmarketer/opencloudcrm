BEGIN;

UPDATE prompt_guides
SET
  description = 'Turn one winning Pinterest video into a new AI-presenter affiliate pin.',
  body = 'Find a Pinterest video that''s already performing well in your niche with a product tagged on it, then use the three prompts below with Claude Code, ChatGPT, and Higgsfield AI to recreate it with your own AI presenter and a real product, no filming or voice recording needed.'
WHERE slug = 'pinterest-affiliate-marketing-has-changed-forever-with-ai';

COMMIT;
