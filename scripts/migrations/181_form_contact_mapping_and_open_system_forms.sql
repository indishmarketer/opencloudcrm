-- Forms, round two. Three separate changes, all additive:
--
-- 1. The seeded Contact and Newsletter forms stop being undeletable. Before
--    this, `system_role` did double duty: it labelled the extra behaviour a
--    form carries (a newsletter signup also writes newsletter_subscribers; a
--    contact submission also writes contact_submissions) AND it locked the
--    form against deletion and against turning its email verification off.
--    Those are two different things. The label stays -- a newsletter form
--    that still exists keeps subscribing people -- but the lock is gone, so
--    Contact and Newsletter are now ordinary forms the owner can edit,
--    restyle, and delete. `is_fixed` keeps its original, narrower meaning:
--    only the Sign up / Log in form, whose field list is enforced by core
--    auth plumbing, is fixed, and even that one stays restylable.
--
-- 2. Contact details gathered from a form. Each form element can now say
--    where its answer goes on the contact record (see FormContactMapping in
--    src/lib/formsShape.ts). "Extra contact detail" answers land here --
--    one row per contact per key, latest answer winning -- so they show on
--    the contact's own page next to their activity and can be deleted
--    individually without touching the submission they came from.
--
-- 3. The custom_form.submitted workflow trigger can now be narrowed to one
--    specific form, the same way course triggers are narrowed to one course.

BEGIN;

-- 1. Unlock the seeded system forms ────────────────────────────────────────
-- is_fixed was set to true on the 'auth' form only (see 178), so nothing to
-- change there. system_role rows need no data change either -- what changes
-- is that the application no longer reads it as a delete/edit lock. The
-- comment below records that for anyone reading the schema directly.
COMMENT ON COLUMN forms.system_role IS
  'Extra built-in behaviour this form carries on submit (''contact'' also writes contact_submissions, ''newsletter'' also writes newsletter_subscribers). A label, NOT a permission: these forms are fully editable and deletable. Only is_fixed locks a field list.';
COMMENT ON COLUMN forms.is_fixed IS
  'True only for the Sign up / Log in form, whose field list is enforced by core auth plumbing. Its copy and design stay editable; it cannot be deleted.';

-- 2. Form-gathered contact details ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_form_details (
  id bigserial PRIMARY KEY,
  contact_id bigint NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  label text NOT NULL DEFAULT '',
  value text NOT NULL DEFAULT '',
  -- Kept nullable, and SET NULL on delete, so removing a form or purging a
  -- submission never silently removes a detail the owner chose to keep on
  -- the contact.
  form_id integer REFERENCES forms(id) ON DELETE SET NULL,
  submission_id integer REFERENCES form_submissions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_contact_form_details_contact
  ON contact_form_details (contact_id, updated_at DESC);

-- 3. Per-form narrowing for the custom_form.submitted trigger ──────────────
-- Identical in every other respect to the version in 173; the only new
-- clause is the formId one. A trigger node with no formId still catches
-- every form, so existing workflows are unaffected.
CREATE OR REPLACE FUNCTION queue_visual_workflow_event_record(p_event_uuid uuid, p_event_type text, p_payload jsonb)
RETURNS void AS $$
BEGIN
  INSERT INTO automation_workflow_runs (workflow_id, dedupe_key, trigger_payload)
  SELECT w.id, p_event_uuid::text, p_payload
  FROM automation_workflows w
  CROSS JOIN LATERAL (
    SELECT node->'data'->'config' AS config FROM jsonb_array_elements(w.graph->'nodes') AS x(node)
    WHERE node->'data'->>'kind'='trigger' LIMIT 1
  ) t
  WHERE w.status='active' AND w.archived_at IS NULL AND w.trigger_type='event' AND w.trigger_key=p_event_type
    AND (NULLIF(t.config->>'courseId','') IS NULL OR t.config->>'courseId'=p_payload->'data'->>'course_id')
    AND (NULLIF(t.config->>'formId','') IS NULL OR t.config->>'formId'=p_payload->'data'->>'form_id')
    AND (t.config->>'legacyTriggerKey' IS DISTINCT FROM 'course_enroll_free' OR p_payload->'data'->>'tier'='free')
    AND (t.config->>'legacyTriggerKey' IS DISTINCT FROM 'course_purchase' OR (p_payload->'data'->>'tier'='pro' AND p_event_type='course.enrolled'))
    AND (p_event_type<>'course.inactivity' OR (p_payload->'data'->>'last_active_at')::timestamptz <= now() - (GREATEST(1,LEAST(365,COALESCE(NULLIF(t.config->>'inactiveDays','')::int,3))) * interval '1 day'))
    AND NOT EXISTS (
      SELECT 1 FROM email_flow_runs r WHERE r.flow_id=NULLIF(t.config->>'legacyFlowId','')::int
       AND r.contact_id=NULLIF(p_payload->>'contact_id','')::bigint AND r.status='active'
    )
  ON CONFLICT (workflow_id,dedupe_key) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMIT;
