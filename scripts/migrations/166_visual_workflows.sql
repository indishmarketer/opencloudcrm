-- Unified, database-backed workflow graphs and durable event runs.
BEGIN;

CREATE TABLE IF NOT EXISTS automation_workflows (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  trigger_type TEXT NOT NULL DEFAULT 'event' CHECK (trigger_type IN ('event', 'webhook')),
  trigger_key TEXT,
  webhook_token_hash TEXT UNIQUE,
  graph JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((trigger_type = 'event' AND trigger_key IS NOT NULL) OR (trigger_type = 'webhook' AND webhook_token_hash IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_automation_workflows_trigger
  ON automation_workflows(trigger_type, trigger_key) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS automation_workflow_runs (
  id BIGSERIAL PRIMARY KEY,
  workflow_id BIGINT NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  trigger_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  node_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE (workflow_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_automation_workflow_runs_queued
  ON automation_workflow_runs(created_at, id) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_automation_workflow_runs_history
  ON automation_workflow_runs(workflow_id, created_at DESC);

-- Queue every emitted site event for matching active workflows, including
-- events produced by existing database triggers such as contact.created.
CREATE OR REPLACE FUNCTION queue_visual_workflow_event() RETURNS trigger AS $$
BEGIN
  INSERT INTO automation_workflow_runs (workflow_id, dedupe_key, trigger_payload)
  SELECT w.id, NEW.event_uuid::text, NEW.payload
  FROM automation_workflows w
  WHERE w.status = 'active' AND w.trigger_type = 'event' AND w.trigger_key = NEW.event_type
  ON CONFLICT (workflow_id, dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_queue_visual_workflow_event ON webhook_outbox_events;
CREATE TRIGGER trg_queue_visual_workflow_event AFTER INSERT ON webhook_outbox_events
FOR EACH ROW EXECUTE FUNCTION queue_visual_workflow_event();

COMMIT;
