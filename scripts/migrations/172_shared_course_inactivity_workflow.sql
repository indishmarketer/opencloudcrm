-- Apply shared trigger filters and lift the saved course-inactivity email
-- steps from the database into the reusable visual workflow. Message copy is
-- copied from existing database rows; no course-specific content is stored
-- in this migration.

CREATE OR REPLACE FUNCTION queue_visual_workflow_event_record(p_event_uuid uuid, p_event_type text, p_payload jsonb)
RETURNS void AS $$
BEGIN
  INSERT INTO automation_workflow_runs (workflow_id, dedupe_key, trigger_payload)
  SELECT w.id, p_event_uuid::text, p_payload
  FROM automation_workflows w
  CROSS JOIN LATERAL (
    SELECT node->'data'->'config' AS config
    FROM jsonb_array_elements(w.graph->'nodes') AS x(node)
    WHERE node->'data'->>'kind' = 'trigger'
    LIMIT 1
  ) trigger_node
  WHERE w.status = 'active'
    AND w.archived_at IS NULL
    AND w.trigger_type = 'event'
    AND w.trigger_key = p_event_type
    AND (
      p_event_type NOT IN ('course.enrolled', 'course.upgraded', 'course.completed', 'course.inactivity')
      OR NULLIF(trigger_node.config->>'courseId', '') IS NULL
      OR trigger_node.config->>'courseId' = p_payload->'data'->>'course_id'
    )
    AND (
      p_event_type <> 'course.inactivity'
      OR (p_payload->'data'->>'last_active_at')::timestamptz <= now() - (
        CASE WHEN trigger_node.config->>'inactiveDays' ~ '^[0-9]+$'
          THEN GREATEST(1, LEAST(365, (trigger_node.config->>'inactiveDays')::int))
          ELSE 3
        END * interval '1 day'
      )
    )
    -- Existing legacy inactivity sends finish before the shared journey takes
    -- over that learner, so activating this workflow cannot duplicate mail.
    AND (
      p_event_type <> 'course.inactivity'
      OR NOT EXISTS (
        SELECT 1
        FROM email_flow_scheduled s
        JOIN email_flow_steps st ON st.id = s.step_id
        JOIN email_flows f ON f.id = st.flow_id
        WHERE f.trigger_key = 'course_inactivity'
          AND f.active = true AND f.archived_at IS NULL
          AND f.course_id = (p_payload->'data'->>'course_id')::int
          AND lower(s.recipient_email) = lower((SELECT c.email FROM contacts c WHERE c.id = NULLIF(p_payload->>'contact_id', '')::bigint))
          AND s.status = 'pending'
      )
    )
    AND (
      p_event_type <> 'course.inactivity'
      OR NOT EXISTS (
        SELECT 1
        FROM email_flow_runs r
        JOIN email_flows f ON f.id = r.flow_id
        WHERE f.trigger_key = 'course_inactivity'
          AND f.active = true AND f.archived_at IS NULL
          AND f.course_id = (p_payload->'data'->>'course_id')::int
          AND r.contact_id = NULLIF(p_payload->>'contact_id', '')::bigint
          AND r.status = 'active'
      )
    )
  ON CONFLICT (workflow_id, dedupe_key) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION queue_visual_workflow_event() RETURNS trigger AS $$
BEGIN
  PERFORM queue_visual_workflow_event_record(NEW.event_uuid, NEW.event_type, NEW.payload);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  target_id bigint;
  source_id integer;
  source_flow record;
  step record;
  nodes jsonb;
  edges jsonb;
  previous_id text;
  node_id text;
  wait_id text;
  x_position integer;
  first_wait boolean;
BEGIN
  SELECT id, graph INTO target_id, nodes
  FROM automation_workflows
  WHERE trigger_type = 'event' AND trigger_key = 'course.inactivity' AND archived_at IS NULL
  ORDER BY id LIMIT 1;

  IF target_id IS NULL THEN
    RETURN;
  END IF;

  -- Do not overwrite a draft an admin has already edited or activated.
  IF EXISTS (
    SELECT 1 FROM automation_workflows w
    WHERE w.id = target_id AND w.status = 'draft'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(w.graph->'nodes') n(node)
        WHERE node->'data'->>'kind' = 'email'
          AND (COALESCE(node->'data'->'config'->>'subject', '') <> ''
            OR COALESCE(node->'data'->'config'->>'body', '') <> '')
      )
  ) THEN
    SELECT f.id INTO source_id
    FROM email_flows f
    JOIN email_flow_steps st ON st.flow_id = f.id AND st.archived_at IS NULL
    WHERE f.trigger_key = 'course_inactivity' AND f.active = true AND f.archived_at IS NULL
    ORDER BY f.id
    LIMIT 1;

    IF source_id IS NOT NULL THEN
      SELECT * INTO source_flow FROM email_flows WHERE id = source_id;
      nodes := jsonb_build_array(jsonb_build_object(
        'id', 'trigger', 'type', 'workflow', 'position', jsonb_build_object('x', 80, 'y', 180),
        'data', jsonb_build_object('kind', 'trigger', 'label', 'Course inactivity detected',
          'config', jsonb_build_object('triggerType', 'event', 'triggerKey', 'course.inactivity', 'courseId', '', 'inactiveDays', 3))
      ));
      edges := '[]'::jsonb;
      previous_id := 'trigger';
      x_position := 360;
      first_wait := true;

      FOR step IN
        SELECT id, position, delay_days, from_email, subject, body_html
        FROM email_flow_steps
        WHERE flow_id = source_id AND archived_at IS NULL AND action_type = 'email'
        ORDER BY position, id
      LOOP
        IF step.delay_days > 0 THEN
          wait_id := 'wait-' || step.id::text;
          nodes := nodes || jsonb_build_array(jsonb_build_object(
            'id', wait_id, 'type', 'workflow', 'position', jsonb_build_object('x', x_position, 'y', 180),
            'data', jsonb_build_object('kind', 'wait', 'label', 'Wait ' || step.delay_days || ' days',
              'config', jsonb_build_object('duration', step.delay_days, 'unit', 'days',
                'anchorPath', CASE WHEN first_wait THEN 'data.last_active_at' ELSE '' END))
          ));
          edges := edges || jsonb_build_array(jsonb_build_object('id', previous_id || '-' || wait_id, 'source', previous_id, 'target', wait_id, 'animated', true));
          previous_id := wait_id;
          x_position := x_position + 280;
          first_wait := false;
        END IF;

        node_id := 'email-' || step.id::text;
        nodes := nodes || jsonb_build_array(jsonb_build_object(
          'id', node_id, 'type', 'workflow', 'position', jsonb_build_object('x', x_position, 'y', 180),
          'data', jsonb_build_object('kind', 'email', 'label', left(step.subject, 120),
            'config', jsonb_build_object('to', '{{contact.email}}', 'from', step.from_email,
              'contentMode', 'custom', 'subject', step.subject, 'body', step.body_html,
              'purpose', source_flow.purpose))
        ));
        edges := edges || jsonb_build_array(jsonb_build_object('id', previous_id || '-' || node_id, 'source', previous_id, 'target', node_id, 'animated', true));
        previous_id := node_id;
        x_position := x_position + 280;
      END LOOP;

      IF jsonb_array_length(nodes) > 1 THEN
        UPDATE automation_workflows
        SET graph = jsonb_build_object('nodes', nodes, 'edges', edges),
            status = 'active', updated_at = now()
        WHERE id = target_id AND status = 'draft';
      END IF;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;
