-- Real outbound webhook/integration platform: durable outbox + per-destination
-- delivery queue, replacing the inert "Outbound webhook URL" integration field
-- that was stored but never actually called.

BEGIN;

CREATE TABLE IF NOT EXISTS webhook_destinations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  event_types TEXT[] NOT NULL DEFAULT '{}',
  signing_secret TEXT NOT NULL,
  description TEXT,
  migrated_from_integration_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_outbox_events (
  id BIGSERIAL PRIMARY KEY,
  event_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  is_test BOOLEAN NOT NULL DEFAULT false,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_record_id, event_type)
);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_events_type ON webhook_outbox_events(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_events_created ON webhook_outbox_events(created_at);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  destination_id INTEGER NOT NULL REFERENCES webhook_destinations(id) ON DELETE CASCADE,
  event_id BIGINT NOT NULL REFERENCES webhook_outbox_events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  last_http_status INTEGER,
  last_response_excerpt TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  UNIQUE (destination_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
  ON webhook_deliveries(next_attempt_at) WHERE status IN ('pending', 'processing', 'failed');
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_destination
  ON webhook_deliveries(destination_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON webhook_deliveries(event_id);

-- contact.created has exactly one real choke point: every existing entry
-- path (signup, newsletter, contact form, voice lead, user sync triggers)
-- already funnels through one INSERT into `contacts` (see sync_user_contact
-- etc. in migration 042 and ensureContact() in src/lib/contacts.ts). Hooking
-- the table itself, not each caller, guarantees exactly one emission per new
-- contact with no risk of a future call site double-firing it.
CREATE OR REPLACE FUNCTION emit_contact_created_webhook_event() RETURNS trigger AS $$
DECLARE
  new_event_id BIGINT;
BEGIN
  INSERT INTO webhook_outbox_events (event_type, source, source_record_id, contact_id, payload, occurred_at)
  VALUES (
    'contact.created', 'contacts', NEW.id::text, NEW.id,
    jsonb_build_object(
      'schema_version', 1,
      'event_id', gen_random_uuid(),
      'event_type', 'contact.created',
      'occurred_at', to_char(NEW.first_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'source', 'contacts',
      'contact_id', NEW.id,
      'data', jsonb_build_object(
        'contact_id', NEW.id,
        'email', NEW.email,
        'name', NEW.name,
        'has_account', NEW.user_id IS NOT NULL
      )
    ),
    NEW.first_seen_at
  )
  ON CONFLICT (source, source_record_id, event_type) DO NOTHING
  RETURNING id INTO new_event_id;

  IF new_event_id IS NOT NULL THEN
    INSERT INTO webhook_deliveries (destination_id, event_id)
    SELECT d.id, new_event_id FROM webhook_destinations d
    WHERE d.enabled = true AND 'contact.created' = ANY(d.event_types);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_emit_contact_created_webhook_event ON contacts;
CREATE TRIGGER trg_emit_contact_created_webhook_event AFTER INSERT ON contacts
FOR EACH ROW EXECUTE FUNCTION emit_contact_created_webhook_event();

-- Migrate any legacy "Outbound webhook URL" integration rows into real
-- destinations instead of silently dropping the stored URL. Landed disabled
-- with zero subscribed events -- the owner must deliberately review, pick
-- events, and enable each one before it can deliver anything. The seeded
-- signing secret is a random placeholder (pure SQL, no pgcrypto dependency);
-- the console's "Rotate secret" replaces it with a properly generated one
-- before the owner would ever share it with a receiving system.
INSERT INTO webhook_destinations (name, url, enabled, event_types, signing_secret, description, migrated_from_integration_id)
SELECT
  name,
  config->>'value',
  false,
  '{}',
  md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text),
  'Migrated automatically from the old "Outbound webhook URL" integration field, which was stored but never actually called. Review, choose events, rotate the secret, and enable to activate real delivery.',
  id
FROM integrations
WHERE type = 'webhook_url' AND config->>'value' IS NOT NULL AND trim(config->>'value') <> '';

DELETE FROM integrations WHERE type = 'webhook_url';

COMMIT;
