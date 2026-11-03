-- User-managed folders for visual workflows and email journeys.
BEGIN;

CREATE TABLE IF NOT EXISTS automation_workflow_folders (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(trim(name)) BETWEEN 1 AND 80)
);

INSERT INTO automation_workflow_folders (name)
VALUES ('Important')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE automation_workflows
  ADD COLUMN IF NOT EXISTS folder_id BIGINT REFERENCES automation_workflow_folders(id) ON DELETE SET NULL;

ALTER TABLE email_flows
  ADD COLUMN IF NOT EXISTS folder_id BIGINT REFERENCES automation_workflow_folders(id) ON DELETE SET NULL;

ALTER TABLE email_flows
  ADD COLUMN IF NOT EXISTS paused_by_visual_workflow BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_automation_workflows_folder
  ON automation_workflows(folder_id, updated_at DESC) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_flows_folder
  ON email_flows(folder_id, created_at DESC) WHERE archived_at IS NULL;

-- One reusable, opt-in inactivity journey. Its variables come from the
-- course.inactivity event, so the same canvas workflow handles every course.
-- It starts as a draft; the existing email journeys stay live until an admin
-- activates this workflow from the console.
INSERT INTO automation_workflows (name, description, status, trigger_type, trigger_key, graph)
SELECT
  'Course inactivity reminder',
  'A shared reminder journey for learners across all courses.',
  'draft',
  'event',
  'course.inactivity',
  $graph${
    "nodes": [
      {"id":"trigger","type":"workflow","position":{"x":80,"y":180},"data":{"kind":"trigger","label":"Course inactivity detected","config":{"triggerType":"event","triggerKey":"course.inactivity"}}},
      {"id":"wait-3-days","type":"workflow","position":{"x":360,"y":180},"data":{"kind":"wait","label":"Wait 3 days","config":{"duration":3,"unit":"days","anchorPath":"data.last_active_at"}}},
      {"id":"email-reminder","type":"workflow","position":{"x":640,"y":180},"data":{"kind":"email","label":"Course progress reminder","config":{"to":"{{contact.email}}","contentMode":"custom","templateKind":"library","templateKey":"","subject":"","body":"","purpose":"service"}}}
    ],
    "edges": [
      {"id":"trigger-wait","source":"trigger","target":"wait-3-days","animated":true},
      {"id":"wait-email","source":"wait-3-days","target":"email-reminder","animated":true}
    ]
  }$graph$::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM automation_workflows
  WHERE trigger_type = 'event' AND trigger_key = 'course.inactivity' AND archived_at IS NULL
);

-- Bring the existing meeting confirmation into the normal workflow list as an
-- editable draft. The legacy booking handler stays active until this flow is
-- deliberately switched on; its saved email template continues to supply the
-- managed link and calendar invite through the visual runner.
INSERT INTO automation_workflows (name, description, status, trigger_type, trigger_key, folder_id, graph)
SELECT
  'Meeting booking confirmation',
  'Confirmation sent after a meeting is booked.',
  'draft',
  'event',
  'meeting.booked',
  (SELECT id FROM automation_workflow_folders WHERE name = 'Important'),
  $graph${
    "nodes": [
      {"id":"trigger","type":"workflow","position":{"x":80,"y":180},"data":{"kind":"trigger","label":"A meeting is booked","config":{"triggerType":"event","triggerKey":"meeting.booked"}}},
      {"id":"email-confirmation","type":"workflow","position":{"x":360,"y":180},"data":{"kind":"email","label":"Send meeting confirmation","config":{"to":"{{contact.email}}","contentMode":"template","templateKind":"fixed","templateKey":"meeting-confirmation","subject":"","body":"","purpose":"service"}}}
    ],
    "edges": [
      {"id":"trigger-email","source":"trigger","target":"email-confirmation","animated":true}
    ]
  }$graph$::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM automation_workflows
  WHERE trigger_type = 'event' AND trigger_key = 'meeting.booked' AND archived_at IS NULL
);

COMMIT;
