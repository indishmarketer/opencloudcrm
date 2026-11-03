BEGIN;

INSERT INTO prompt_categories (slug, name, sort_order) VALUES
  ('automation', 'Automation', 5)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
