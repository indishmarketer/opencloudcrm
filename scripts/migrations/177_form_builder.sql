-- Form builder: named, reusable forms an admin creates in Console -> Forms,
-- instead of each form (newsletter, custom form block, etc.) being a
-- one-off hardcoded component with no shared identity. A saved form can be
-- placed as a page-builder block ("savedForm") or opened as a popup from
-- any button, and the same form can be reused in multiple places. See
-- src/lib/formsShape.ts for the field definition shape.
CREATE TABLE forms (
  id serial PRIMARY KEY,
  name text NOT NULL,
  heading text NOT NULL DEFAULT '',
  intro_text text NOT NULL DEFAULT '',
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  submit_label text NOT NULL DEFAULT 'Submit',
  success_heading text NOT NULL DEFAULT '',
  success_text text NOT NULL DEFAULT '',
  notify_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Durable, queryable submissions -- the generic "custom" Form element used
-- to fire a one-off inbox alert with nothing persisted (see 164's
-- CustomFormBlock/forms/submit route); a saved form's submissions are now
-- real rows, listable from the form's own console page.
CREATE TABLE form_submissions (
  id serial PRIMARY KEY,
  form_id integer NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_url text NOT NULL DEFAULT '',
  contact_id integer REFERENCES contacts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_form_submissions_form_id ON form_submissions (form_id, created_at DESC);
