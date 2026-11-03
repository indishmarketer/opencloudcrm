-- Apply the course selector and inactivity threshold stored on the visual
-- workflow trigger before the event is placed on that workflow's run queue.
BEGIN;

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
    AND w.trigger_type = 'event'
    AND w.trigger_key = p_event_type
    AND (
      w.trigger_key <> 'course.inactivity'
      OR (
        (NULLIF(trigger_node.config->>'courseId', '') IS NULL
          OR trigger_node.config->>'courseId' = p_payload->'data'->>'course_id')
        AND (p_payload->'data'->>'last_active_at')::timestamptz <= now() - (
          CASE WHEN trigger_node.config->>'inactiveDays' ~ '^[0-9]+$'
            THEN GREATEST(1, LEAST(365, (trigger_node.config->>'inactiveDays')::int))
            ELSE 3
          END * interval '1 day'
        )
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

COMMIT;
