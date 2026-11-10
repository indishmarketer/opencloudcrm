-- 179_form_builder_canvas.sql: Form canvas elements and submission redirect action
-- Additive columns allowing forms to be composed of arbitrary drag-and-drop
-- canvas elements (headings, text, fields, buttons, dividers) and support
-- thank you redirect URLs.

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS elements jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS submission_action text NOT NULL DEFAULT 'message';

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS redirect_url text NOT NULL DEFAULT '';
