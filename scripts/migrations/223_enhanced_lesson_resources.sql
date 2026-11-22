-- Enhanced course lesson resources:
-- Supports Action Buttons (e.g. "Get Vultr VPS"), Downloadable Files (e.g. PDFs),
-- and Guide Notes / Code / Text snippets.
--
-- Adds:
--   type: 'button' | 'link' | 'pdf' | 'text' (default 'button')
--   content: text for guide notes, code blocks, or instructions
--   icon: preset icon key for button visual (e.g. 'server', 'link', 'download', 'book', 'code')
--
-- Drops NOT NULL on url so text resources can exist without dummy links.

ALTER TABLE lesson_resources
  ADD COLUMN IF NOT EXISTS type VARCHAR(32) NOT NULL DEFAULT 'button',
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS icon VARCHAR(64);

ALTER TABLE lesson_resources ALTER COLUMN url DROP NOT NULL;

-- Seed the Vultr and Hostinger buttons for Chapter 2 ("Buying the server")
-- if they don't already exist.
DO $$
DECLARE
  v_lesson_id INTEGER;
BEGIN
  SELECT id INTO v_lesson_id
  FROM course_lessons
  WHERE title = 'Buying the server'
  LIMIT 1;

  IF v_lesson_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM lesson_resources
      WHERE lesson_id = v_lesson_id AND label ILIKE '%Vultr%'
    ) THEN
      INSERT INTO lesson_resources (lesson_id, label, url, type, icon, position)
      VALUES (v_lesson_id, 'Get Vultr VPS', 'https://www.vultr.com', 'button', 'server', 1);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM lesson_resources
      WHERE lesson_id = v_lesson_id AND label ILIKE '%Hostinger%'
    ) THEN
      INSERT INTO lesson_resources (lesson_id, label, url, type, icon, position)
      VALUES (v_lesson_id, 'Get Hostinger VPS', 'https://www.hostinger.com/vps-hosting', 'button', 'server', 2);
    END IF;
  END IF;
END $$;
