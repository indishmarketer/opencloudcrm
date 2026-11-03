-- Lift saved email journeys into the shared visual workflow engine. All
-- names, subjects, bodies, timing and filters are copied from database rows.
-- Legacy run/schedule/delivery records remain available for audit/history.
BEGIN;

ALTER TABLE email_flows
  ADD COLUMN IF NOT EXISTS visual_workflow_id BIGINT REFERENCES automation_workflows(id) ON DELETE SET NULL;
ALTER TABLE automation_workflows
  ADD COLUMN IF NOT EXISTS legacy_email_flow_id INTEGER REFERENCES email_flows(id) ON DELETE SET NULL;
ALTER TABLE email_deliveries
  ADD COLUMN IF NOT EXISTS workflow_run_id BIGINT REFERENCES automation_workflow_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_node_id TEXT;
CREATE INDEX IF NOT EXISTS idx_email_deliveries_workflow_node
  ON email_deliveries(workflow_run_id, workflow_node_id) WHERE workflow_run_id IS NOT NULL;
ALTER TABLE review_requests
  ADD COLUMN IF NOT EXISTS automation_workflow_id BIGINT REFERENCES automation_workflows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS automation_workflow_node_id TEXT;

DO $$
DECLARE
  f record;
  s record;
  workflow_id bigint;
  graph_nodes jsonb;
  graph_edges jsonb;
  previous_node text;
  wait_node text;
  email_node text;
  condition_node text;
  last_email_node text;
  stop_node text;
  x integer;
  mapped_trigger_key text;
BEGIN
  FOR f IN
    SELECT * FROM email_flows ef
    WHERE ef.archived_at IS NULL AND ef.visual_workflow_id IS NULL
      AND ef.trigger_key IN ('user_signup_verified','course_enroll_free','course_purchase',
        'course_upgrade_to_pro','course_inactivity','course_completed','newsletter_signup',
        'community_inactivity','voice_agent_interest')
    ORDER BY id
  LOOP
    mapped_trigger_key := CASE f.trigger_key
      WHEN 'user_signup_verified' THEN 'user.verified'
      WHEN 'course_enroll_free' THEN 'course.enrolled'
      WHEN 'course_purchase' THEN 'course.enrolled'
      WHEN 'course_upgrade_to_pro' THEN 'course.upgraded'
      WHEN 'course_inactivity' THEN 'course.inactivity'
      WHEN 'course_completed' THEN 'course.completed'
      WHEN 'newsletter_signup' THEN 'newsletter.subscribed'
      WHEN 'community_inactivity' THEN 'community.member_inactive'
      WHEN 'voice_agent_interest' THEN 'voice_agent.interest'
    END;

    workflow_id := NULL;
    INSERT INTO automation_workflows
      (name, description, status, trigger_type, trigger_key, folder_id, legacy_email_flow_id)
    VALUES
      (f.name, 'Imported from the saved email journey. Uses the shared visual workflow engine.',
       CASE WHEN f.active
         AND EXISTS (SELECT 1 FROM email_flow_steps x WHERE x.flow_id=f.id AND x.archived_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM email_flow_steps x WHERE x.flow_id=f.id AND x.archived_at IS NULL AND x.action_type='email' AND (trim(x.subject)='' OR trim(x.body_html)=''))
         AND NOT EXISTS (SELECT 1 FROM email_flow_steps x WHERE x.flow_id=f.id AND x.archived_at IS NULL AND x.condition_type<>'always' AND x.condition_step_id IS NULL)
         THEN 'active' ELSE 'draft' END,
       'event', mapped_trigger_key, f.folder_id, f.id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO workflow_id;
    IF workflow_id IS NULL THEN
      SELECT id INTO workflow_id FROM automation_workflows WHERE legacy_email_flow_id = f.id LIMIT 1;
    END IF;
    IF workflow_id IS NULL THEN CONTINUE; END IF;

    graph_nodes := jsonb_build_array(jsonb_build_object(
      'id','trigger','type','workflow','position',jsonb_build_object('x',80,'y',180),
      'data',jsonb_build_object('kind','trigger','label',f.trigger_key,
        'config',jsonb_build_object('triggerType','event','triggerKey',mapped_trigger_key,
          'legacyTriggerKey',f.trigger_key,'legacyFlowId',f.id,'courseId',COALESCE(f.course_id::text,''),
          'purpose',f.purpose,'entrySegmentId',f.entry_segment_id,'goalType',f.goal_type,
          'inactiveDays',CASE WHEN f.trigger_key='course_inactivity' THEN COALESCE(NULLIF((SELECT delay_days FROM email_flow_steps WHERE flow_id=f.id AND archived_at IS NULL ORDER BY position,id LIMIT 1),0),3) ELSE 3 END)))
    );
    graph_edges := '[]'::jsonb;
    previous_node := 'trigger';
    last_email_node := NULL;
    x := 360;

    FOR s IN SELECT * FROM email_flow_steps
      WHERE flow_id=f.id AND archived_at IS NULL ORDER BY position,id
    LOOP
      IF COALESCE(s.delay_days,0) > 0 AND NOT (f.trigger_key='course_inactivity' AND s.id=(SELECT id FROM email_flow_steps WHERE flow_id=f.id AND archived_at IS NULL ORDER BY position,id LIMIT 1)) THEN
        wait_node := 'wait-' || s.id::text;
        graph_nodes := graph_nodes || jsonb_build_array(jsonb_build_object(
          'id',wait_node,'type','workflow','position',jsonb_build_object('x',x,'y',180),
          'data',jsonb_build_object('kind','wait','label','Wait '||s.delay_days||' days',
            'config',jsonb_build_object('duration',s.delay_days,'unit','days',
              'anchorPath',CASE WHEN f.trigger_key='community_inactivity' AND previous_node='trigger' THEN 'occurred_at' ELSE '' END))));
        graph_edges := graph_edges || jsonb_build_array(jsonb_build_object('id',previous_node||'-'||wait_node,'source',previous_node,'target',wait_node,'animated',true));
        previous_node := wait_node;
        x := x + 280;
      END IF;

      IF s.condition_type <> 'always' THEN
        condition_node := 'condition-' || s.id::text;
        graph_nodes := graph_nodes || jsonb_build_array(jsonb_build_object(
          'id',condition_node,'type','workflow','position',jsonb_build_object('x',x,'y',180),
          'data',jsonb_build_object('kind','email_condition','label','Email '||replace(s.condition_type,'_',' '),
            'config',jsonb_build_object('condition',s.condition_type,
              'emailNodeId',COALESCE('email-'||s.condition_step_id::text,last_email_node,'')))));
        graph_edges := graph_edges || jsonb_build_array(
          jsonb_build_object('id',previous_node||'-'||condition_node,'source',previous_node,'target',condition_node,'animated',true),
          jsonb_build_object('id',condition_node||'-'||s.id::text,'source',condition_node,'target','email-'||s.id::text,'sourceHandle','true','animated',true));
        stop_node := 'end-condition-'||s.id::text;
        graph_nodes := graph_nodes || jsonb_build_array(jsonb_build_object(
          'id',stop_node,'type','workflow','position',jsonb_build_object('x',x,'y',330),
          'data',jsonb_build_object('kind','stop','label','End if not matched','config','{}'::jsonb)));
        graph_edges := graph_edges || jsonb_build_array(jsonb_build_object(
          'id',condition_node||'-'||stop_node,'source',condition_node,'target',stop_node,'sourceHandle','false','animated',true));
        previous_node := condition_node;
        x := x + 280;
      END IF;

      email_node := 'email-'||s.id::text;
      IF s.action_type = 'google_review_request' THEN
        graph_nodes := graph_nodes || jsonb_build_array(jsonb_build_object(
          'id',email_node,'type','workflow','position',jsonb_build_object('x',x,'y',180),
          'data',jsonb_build_object('kind','google_review_request','label',COALESCE(NULLIF(s.subject,''),'Google review request'),
            'config',jsonb_build_object('templateKey',COALESCE(s.review_template_key,'google-review-request')))));
      ELSE
        graph_nodes := graph_nodes || jsonb_build_array(jsonb_build_object(
          'id',email_node,'type','workflow','position',jsonb_build_object('x',x,'y',180),
          'data',jsonb_build_object('kind','email','label',COALESCE(NULLIF(s.subject,''),'Email'),
            'config',jsonb_build_object('to','{{contact.email}}','from',s.from_email,'contentMode','custom',
              'subject',s.subject,'body',s.body_html,'purpose',f.purpose))));
      END IF;
      IF s.condition_type = 'always' THEN
        graph_edges := graph_edges || jsonb_build_array(jsonb_build_object('id',previous_node||'-'||email_node,'source',previous_node,'target',email_node,'animated',true));
      END IF;
      previous_node := email_node;
      last_email_node := email_node;
      x := x + 280;
    END LOOP;

    UPDATE automation_workflows SET graph=jsonb_build_object('nodes',graph_nodes,'edges',graph_edges),updated_at=now()
      WHERE id=workflow_id;
    UPDATE email_flows SET visual_workflow_id=workflow_id WHERE id=f.id;
  END LOOP;
END $$;

-- Retire the earlier shared inactivity placeholder once per-course legacy
-- journeys have been imported, preventing two active copies of the same send.
UPDATE automation_workflows w SET status='paused',updated_at=now()
WHERE w.trigger_key='course.inactivity' AND w.legacy_email_flow_id IS NULL
  AND EXISTS (SELECT 1 FROM email_flows f WHERE f.trigger_key='course_inactivity' AND f.visual_workflow_id IS NOT NULL);

-- A legacy run already in progress retains its scheduled steps. New enrollments
-- are handed to the visual graph and will not be queued a second time.
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

CREATE OR REPLACE FUNCTION queue_visual_workflow_event() RETURNS trigger AS $$
BEGIN
  PERFORM queue_visual_workflow_event_record(NEW.event_uuid,NEW.event_type,NEW.payload);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
