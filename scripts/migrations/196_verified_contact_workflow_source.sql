BEGIN;

-- Narrow verified-contact workflows before a run enters the dispatcher.
-- Other events and existing trigger filters retain their previous behavior.
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
    AND (p_event_type<>'contact.verified' OR NULLIF(t.config->>'source','') IS NULL OR t.config->>'source'=p_payload->'data'->>'source')
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
