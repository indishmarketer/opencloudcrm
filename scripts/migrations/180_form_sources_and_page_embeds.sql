ALTER TABLE forms ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT '';
ALTER TABLE forms ADD COLUMN IF NOT EXISTS system_role text;
UPDATE forms SET source = name WHERE source = '' AND is_fixed = false;

-- Give existing generic page sections a reusable form definition. Draft and
-- published snapshots are migrated independently because a published page
-- may have different content from its current draft.
DO $$
DECLARE
  page_row record;
  snapshot_key text;
  blocks_value jsonb;
  block_value jsonb;
  props_value jsonb;
  mode_value text;
  form_id integer;
  fields_value jsonb;
  field_value jsonb;
  field_index integer;
  block_index integer;
  custom_form_ids jsonb := '{}'::jsonb;
  custom_key text;
BEGIN
  INSERT INTO forms (name, slug, heading, intro_text, fields, submit_label, success_heading, success_text, verify_email, source)
  SELECT 'Contact', 'contact', 'Contact us', 'Send us a message and we''ll get back to you.',
    '[{"key":"name","label":"Name","type":"text","options":"","required":true,"hidden":false,"defaultValue":""},{"key":"email","label":"Email","type":"email","options":"","required":true,"hidden":false,"defaultValue":""},{"key":"message","label":"Message","type":"textarea","options":"","required":true,"hidden":false,"defaultValue":""}]'::jsonb,
    'Send message', 'Thanks, got it.', 'We''ll get back to you shortly.', true, 'Contact'
  WHERE NOT EXISTS (SELECT 1 FROM forms WHERE slug = 'contact');
  INSERT INTO forms (name, slug, heading, intro_text, fields, submit_label, success_heading, success_text, verify_email, source)
  SELECT 'Newsletter', 'newsletter', 'Get updates in your inbox', '',
    '[{"key":"email","label":"Email","type":"email","options":"","required":true,"hidden":false,"defaultValue":""}]'::jsonb,
    'Subscribe', 'Thank you', 'You are subscribed.', true, 'Newsletter'
  WHERE NOT EXISTS (SELECT 1 FROM forms WHERE slug = 'newsletter');
  UPDATE forms SET verify_email = true WHERE slug IN ('contact', 'newsletter');
  UPDATE forms SET system_role = 'contact' WHERE slug = 'contact';
  UPDATE forms SET system_role = 'newsletter' WHERE slug = 'newsletter';

  FOR page_row IN SELECT id, blocks, published FROM site_pages LOOP
    FOREACH snapshot_key IN ARRAY ARRAY['blocks', 'published'] LOOP
      blocks_value := CASE WHEN snapshot_key = 'blocks' THEN page_row.blocks ELSE page_row.published->'blocks' END;
      IF jsonb_typeof(blocks_value) IS DISTINCT FROM 'array' THEN CONTINUE; END IF;
      FOR block_index IN 0..jsonb_array_length(blocks_value)-1 LOOP
        block_value := blocks_value->block_index;
        IF block_value->>'type' = 'hero' AND block_value#>>'{props,primaryAction}' = 'contactPopup' THEN
          SELECT id INTO form_id FROM forms WHERE slug = 'contact' ORDER BY id LIMIT 1;
          block_value := jsonb_set(block_value, '{props}', COALESCE(block_value->'props', '{}'::jsonb) || jsonb_build_object('primaryAction', 'formPopup', 'primaryFormId', form_id::text));
          blocks_value := jsonb_set(blocks_value, ARRAY[block_index::text], block_value);
          CONTINUE;
        END IF;
        IF block_value->>'type' = 'cta' AND block_value#>>'{props,buttonAction}' = 'contactPopup' THEN
          SELECT id INTO form_id FROM forms WHERE slug = 'contact' ORDER BY id LIMIT 1;
          block_value := jsonb_set(block_value, '{props}', COALESCE(block_value->'props', '{}'::jsonb) || jsonb_build_object('buttonAction', 'formPopup', 'buttonFormId', form_id::text));
          blocks_value := jsonb_set(blocks_value, ARRAY[block_index::text], block_value);
          CONTINUE;
        END IF;
        IF block_value->>'type' NOT IN ('form', 'contactForm', 'newsletter') THEN CONTINUE; END IF;
        props_value := COALESCE(block_value->'props', '{}'::jsonb);
        IF COALESCE(props_value->>'savedFormId', '') ~ '^[1-9][0-9]*$' THEN CONTINUE; END IF;
        form_id := NULL;
        mode_value := CASE block_value->>'type'
          WHEN 'contactForm' THEN 'contact'
          WHEN 'newsletter' THEN 'newsletter'
          ELSE COALESCE(props_value->>'mode', 'contact') END;
        IF mode_value = 'contact' THEN
          SELECT id INTO form_id FROM forms WHERE slug = 'contact' ORDER BY id LIMIT 1;
        ELSIF mode_value = 'newsletter' THEN
          SELECT id INTO form_id FROM forms WHERE slug = 'newsletter' ORDER BY id LIMIT 1;
        ELSIF mode_value = 'custom' THEN
          custom_key := page_row.id::text || ':' || COALESCE(block_value->>'id', block_index::text);
          IF custom_form_ids ? custom_key THEN
            form_id := (custom_form_ids->>custom_key)::integer;
          ELSE
          fields_value := '[]'::jsonb;
          field_index := 0;
          FOR field_value IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(props_value->'customFields') = 'array' THEN props_value->'customFields' ELSE '[]'::jsonb END) LOOP
            IF COALESCE(field_value->>'label', '') = '' THEN CONTINUE; END IF;
            fields_value := fields_value || jsonb_build_array(jsonb_build_object(
              'key', 'field_' || field_index, 'label', field_value->>'label',
              'type', CASE WHEN field_value->>'type' IN ('text','email','phone','textarea','select') THEN field_value->>'type' ELSE 'text' END,
              'options', COALESCE(field_value->>'options',''), 'required', COALESCE((field_value->>'required')::boolean, false),
              'hidden', false, 'defaultValue', ''));
            field_index := field_index + 1;
          END LOOP;
          INSERT INTO forms (name, heading, intro_text, fields, submit_label, success_heading, success_text, source)
          VALUES (COALESCE(NULLIF(props_value->>'heading', ''), 'Page form'),
            COALESCE(props_value->>'heading', ''), COALESCE(props_value->>'text', ''), fields_value,
            'Submit', COALESCE(props_value->>'successHeading', 'Thank you'), COALESCE(props_value->>'successText', ''),
            COALESCE(NULLIF(props_value->>'heading', ''), 'Page form')) RETURNING id INTO form_id;
          custom_form_ids := custom_form_ids || jsonb_build_object(custom_key, form_id);
          END IF;
        ELSE
          CONTINUE;
        END IF;
        IF form_id IS NULL THEN CONTINUE; END IF;
        block_value := jsonb_set(block_value, '{type}', '"form"'::jsonb);
        block_value := jsonb_set(block_value, '{props}', (props_value - 'mode' - 'customFields' - 'messageLabel' - 'showDetails' - 'successHeading' - 'successText') || jsonb_build_object('savedFormId', form_id::text, 'showContactDetails', COALESCE((props_value->>'showContactDetails')::boolean, (props_value->>'showDetails')::boolean, false)));
        blocks_value := jsonb_set(blocks_value, ARRAY[block_index::text], block_value);
      END LOOP;
      IF snapshot_key = 'blocks' THEN
        UPDATE site_pages SET blocks = blocks_value WHERE id = page_row.id;
      ELSE
        UPDATE site_pages SET published = jsonb_set(published, '{blocks}', blocks_value) WHERE id = page_row.id AND published IS NOT NULL;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Surface historical saved-form submissions as contact sources as well.
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, metadata, occurred_at)
SELECT fs.contact_id, 'form_submitted', 'form_submissions', fs.id::text,
  jsonb_build_object('formId', f.id, 'formName', f.name, 'label', COALESCE(NULLIF(f.source, ''), f.name), 'pageUrl', fs.page_url), fs.created_at
FROM form_submissions fs JOIN forms f ON f.id = fs.form_id
WHERE fs.contact_id IS NOT NULL
ON CONFLICT (source, source_record_id, activity_type) DO NOTHING;
