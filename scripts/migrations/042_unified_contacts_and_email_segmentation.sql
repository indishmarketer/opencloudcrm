-- Canonical CRM contacts, durable email deliveries, campaign recipient
-- snapshots, and saved dynamic segments.

BEGIN;

ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS allowed_vars TEXT[] NOT NULL DEFAULT '{}';
UPDATE email_templates et
SET allowed_vars = vars.allowed
FROM (
  SELECT key, COALESCE(array_agg(DISTINCT captures[1]), '{}') AS allowed
  FROM email_templates, LATERAL regexp_matches(subject || ' ' || body_html, '\{\{(\w+)\}\}', 'g') AS captures
  GROUP BY key
) vars
WHERE et.key = vars.key AND cardinality(et.allowed_vars) = 0;

CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL UNIQUE,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name TEXT,
  marketing_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (marketing_status IN ('unknown', 'pending', 'subscribed', 'unsubscribed')),
  deliverability_status TEXT NOT NULL DEFAULT 'ok'
    CHECK (deliverability_status IN ('ok', 'suppressed', 'bounced', 'complained', 'invalid')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_emailed_at TIMESTAMPTZ,
  last_engaged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (normalized_email = lower(trim(email)))
);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_marketing ON contacts(marketing_status);
CREATE INDEX IF NOT EXISTS idx_contacts_engaged ON contacts(last_engaged_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS contact_activities (
  id BIGSERIAL PRIMARY KEY,
  contact_id BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  source TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_record_id, activity_type)
);
CREATE INDEX IF NOT EXISTS idx_contact_activities_contact ON contact_activities(contact_id, occurred_at DESC);

-- Accounts are always canonical identities, but not automatically marketing
-- subscribers. Consent is synchronized separately from newsletter_subscribers.
INSERT INTO contacts (email, normalized_email, user_id, name, first_seen_at, last_seen_at)
SELECT lower(trim(email)), lower(trim(email)), id, name, created_at, created_at
FROM users
ON CONFLICT (normalized_email) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  name = COALESCE(contacts.name, EXCLUDED.name),
  first_seen_at = LEAST(contacts.first_seen_at, EXCLUDED.first_seen_at),
  last_seen_at = GREATEST(contacts.last_seen_at, EXCLUDED.last_seen_at),
  updated_at = now();

INSERT INTO contacts (email, normalized_email, user_id, name, marketing_status, first_seen_at, last_seen_at)
SELECT lower(trim(ns.email)), lower(trim(ns.email)), ns.user_id, ns.name,
       CASE WHEN ns.unsubscribed_at IS NOT NULL THEN 'unsubscribed'
            WHEN ns.verified THEN 'subscribed' ELSE 'pending' END,
       ns.created_at, ns.created_at
FROM newsletter_subscribers ns
ON CONFLICT (normalized_email) DO UPDATE SET
  user_id = COALESCE(contacts.user_id, EXCLUDED.user_id),
  name = COALESCE(contacts.name, EXCLUDED.name),
  marketing_status = EXCLUDED.marketing_status,
  first_seen_at = LEAST(contacts.first_seen_at, EXCLUDED.first_seen_at),
  last_seen_at = GREATEST(contacts.last_seen_at, EXCLUDED.last_seen_at),
  updated_at = now();

INSERT INTO contacts (email, normalized_email, user_id, name, first_seen_at, last_seen_at)
SELECT lower(trim(cs.email)), lower(trim(cs.email)), max(cs.user_id), max(cs.name), min(cs.created_at), max(cs.created_at)
FROM contact_submissions cs
GROUP BY lower(trim(cs.email))
ON CONFLICT (normalized_email) DO UPDATE SET
  user_id = COALESCE(contacts.user_id, EXCLUDED.user_id),
  name = COALESCE(contacts.name, EXCLUDED.name),
  first_seen_at = LEAST(contacts.first_seen_at, EXCLUDED.first_seen_at),
  last_seen_at = GREATEST(contacts.last_seen_at, EXCLUDED.last_seen_at),
  updated_at = now();

INSERT INTO contacts (email, normalized_email, user_id, name, first_seen_at, last_seen_at)
SELECT lower(trim(vl.email)), lower(trim(vl.email)), max(vl.user_id), max(vl.name), min(vl.created_at), max(vl.created_at)
FROM voice_leads vl
WHERE vl.email IS NOT NULL AND trim(vl.email) <> ''
GROUP BY lower(trim(vl.email))
ON CONFLICT (normalized_email) DO UPDATE SET
  user_id = COALESCE(contacts.user_id, EXCLUDED.user_id),
  name = COALESCE(contacts.name, EXCLUDED.name),
  first_seen_at = LEAST(contacts.first_seen_at, EXCLUDED.first_seen_at),
  last_seen_at = GREATEST(contacts.last_seen_at, EXCLUDED.last_seen_at),
  updated_at = now();

UPDATE contacts c
SET deliverability_status = 'suppressed', updated_at = now()
WHERE EXISTS (SELECT 1 FROM email_suppressions es WHERE lower(trim(es.email)) = c.normalized_email);

-- Keep the four identity-entry tables synchronized without relying on each
-- application route remembering to perform a second write.
CREATE OR REPLACE FUNCTION sync_user_contact() RETURNS trigger AS $$
DECLARE synced_contact_id BIGINT;
BEGIN
  INSERT INTO contacts (email, normalized_email, user_id, name, first_seen_at, last_seen_at)
  VALUES (lower(trim(NEW.email)), lower(trim(NEW.email)), NEW.id, NEW.name, NEW.created_at, now())
  ON CONFLICT (normalized_email) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    name = COALESCE(EXCLUDED.name, contacts.name),
    last_seen_at = now(), updated_at = now()
  RETURNING id INTO synced_contact_id;
  INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
  VALUES (synced_contact_id, 'account_created', 'users', NEW.id::text, NEW.created_at)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_sync_user_contact ON users;
CREATE TRIGGER trg_sync_user_contact AFTER INSERT OR UPDATE OF email, name ON users
FOR EACH ROW EXECUTE FUNCTION sync_user_contact();

CREATE OR REPLACE FUNCTION sync_newsletter_contact() RETURNS trigger AS $$
DECLARE synced_contact_id BIGINT;
BEGIN
  INSERT INTO contacts (email, normalized_email, user_id, name, marketing_status, first_seen_at, last_seen_at)
  VALUES (
    lower(trim(NEW.email)), lower(trim(NEW.email)), NEW.user_id, NEW.name,
    CASE WHEN NEW.unsubscribed_at IS NOT NULL THEN 'unsubscribed'
         WHEN NEW.verified THEN 'subscribed' ELSE 'pending' END,
    NEW.created_at, now()
  )
  ON CONFLICT (normalized_email) DO UPDATE SET
    user_id = COALESCE(contacts.user_id, EXCLUDED.user_id),
    name = COALESCE(EXCLUDED.name, contacts.name),
    marketing_status = EXCLUDED.marketing_status,
    last_seen_at = now(), updated_at = now()
  RETURNING id INTO synced_contact_id;
  INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, metadata, occurred_at)
  VALUES (synced_contact_id, 'newsletter_status', 'newsletter_subscribers', NEW.id::text,
          jsonb_build_object('verified', NEW.verified, 'unsubscribed', NEW.unsubscribed_at IS NOT NULL), NEW.created_at)
  ON CONFLICT (source, source_record_id, activity_type) DO UPDATE SET metadata = EXCLUDED.metadata;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_sync_newsletter_contact ON newsletter_subscribers;
CREATE TRIGGER trg_sync_newsletter_contact
AFTER INSERT OR UPDATE OF email, name, user_id, verified, unsubscribed_at ON newsletter_subscribers
FOR EACH ROW EXECUTE FUNCTION sync_newsletter_contact();

CREATE OR REPLACE FUNCTION sync_submission_contact() RETURNS trigger AS $$
DECLARE synced_contact_id BIGINT;
BEGIN
  INSERT INTO contacts (email, normalized_email, user_id, name, first_seen_at, last_seen_at)
  VALUES (lower(trim(NEW.email)), lower(trim(NEW.email)), NEW.user_id, NEW.name, NEW.created_at, now())
  ON CONFLICT (normalized_email) DO UPDATE SET
    user_id = COALESCE(contacts.user_id, EXCLUDED.user_id),
    name = COALESCE(contacts.name, EXCLUDED.name),
    last_seen_at = now(), updated_at = now()
  RETURNING id INTO synced_contact_id;
  INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
  VALUES (synced_contact_id, 'contact_message', 'contact_submissions', NEW.id::text, NEW.created_at)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_sync_submission_contact ON contact_submissions;
CREATE TRIGGER trg_sync_submission_contact AFTER INSERT OR UPDATE OF email, name, user_id ON contact_submissions
FOR EACH ROW EXECUTE FUNCTION sync_submission_contact();

CREATE OR REPLACE FUNCTION sync_voice_lead_contact() RETURNS trigger AS $$
DECLARE synced_contact_id BIGINT;
BEGIN
  IF NEW.email IS NULL OR trim(NEW.email) = '' THEN RETURN NEW; END IF;
  INSERT INTO contacts (email, normalized_email, user_id, name, first_seen_at, last_seen_at)
  VALUES (lower(trim(NEW.email)), lower(trim(NEW.email)), NEW.user_id, NEW.name, NEW.created_at, now())
  ON CONFLICT (normalized_email) DO UPDATE SET
    user_id = COALESCE(contacts.user_id, EXCLUDED.user_id),
    name = COALESCE(contacts.name, EXCLUDED.name),
    last_seen_at = now(), updated_at = now()
  RETURNING id INTO synced_contact_id;
  INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
  VALUES (synced_contact_id, 'voice_agent_lead', 'voice_leads', NEW.id::text, NEW.created_at)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_sync_voice_lead_contact ON voice_leads;
CREATE TRIGGER trg_sync_voice_lead_contact AFTER INSERT OR UPDATE OF email, name, user_id ON voice_leads
FOR EACH ROW EXECUTE FUNCTION sync_voice_lead_contact();

-- Any feature backed by a user_id can join the same identity automatically.
-- New feature tables should use this trigger or the application helper in
-- src/lib/contacts.ts so future actions appear on the canonical timeline.
CREATE OR REPLACE FUNCTION sync_user_activity() RETURNS trigger AS $$
DECLARE synced_contact_id BIGINT;
BEGIN
  SELECT id INTO synced_contact_id FROM contacts WHERE user_id = NEW.user_id LIMIT 1;
  IF synced_contact_id IS NOT NULL THEN
    INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
    VALUES (synced_contact_id, TG_ARGV[0], TG_TABLE_NAME, NEW.id::text, NEW.created_at)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contact_product_lead ON product_leads;
CREATE TRIGGER trg_contact_product_lead AFTER INSERT ON product_leads FOR EACH ROW EXECUTE FUNCTION sync_user_activity('product_interest');
DROP TRIGGER IF EXISTS trg_contact_course_enrollment ON course_enrollments;
CREATE TRIGGER trg_contact_course_enrollment AFTER INSERT ON course_enrollments FOR EACH ROW EXECUTE FUNCTION sync_user_activity('course_enrolled');
DROP TRIGGER IF EXISTS trg_contact_payment_claim ON payment_claims;
CREATE TRIGGER trg_contact_payment_claim AFTER INSERT ON payment_claims FOR EACH ROW EXECUTE FUNCTION sync_user_activity('payment_claim');
DROP TRIGGER IF EXISTS trg_contact_community_membership ON community_memberships;
CREATE TRIGGER trg_contact_community_membership AFTER INSERT ON community_memberships FOR EACH ROW EXECUTE FUNCTION sync_user_activity('community_membership');
DROP TRIGGER IF EXISTS trg_contact_author_application ON author_applications;
CREATE TRIGGER trg_contact_author_application AFTER INSERT ON author_applications FOR EACH ROW EXECUTE FUNCTION sync_user_activity('author_application');
DROP TRIGGER IF EXISTS trg_contact_review_submission ON review_submissions;
CREATE TRIGGER trg_contact_review_submission AFTER INSERT ON review_submissions FOR EACH ROW EXECUTE FUNCTION sync_user_activity('review_submitted');
DROP TRIGGER IF EXISTS trg_contact_forum_post ON forum_posts;
CREATE TRIGGER trg_contact_forum_post AFTER INSERT ON forum_posts FOR EACH ROW EXECUTE FUNCTION sync_user_activity('community_post');
DROP TRIGGER IF EXISTS trg_contact_forum_comment ON forum_comments;
CREATE TRIGGER trg_contact_forum_comment AFTER INSERT ON forum_comments FOR EACH ROW EXECUTE FUNCTION sync_user_activity('community_comment');

CREATE OR REPLACE FUNCTION sync_tool_submission_activity() RETURNS trigger AS $$
DECLARE synced_contact_id BIGINT;
BEGIN
  IF NEW.submitted_by_user_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO synced_contact_id FROM contacts WHERE user_id = NEW.submitted_by_user_id LIMIT 1;
  IF synced_contact_id IS NOT NULL THEN
    INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
    VALUES (synced_contact_id, 'tool_submitted', 'directory_tools', NEW.id::text, NEW.created_at)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_contact_tool_submission ON directory_tools;
CREATE TRIGGER trg_contact_tool_submission AFTER INSERT ON directory_tools FOR EACH ROW EXECUTE FUNCTION sync_tool_submission_activity();

-- Backfill the generic timeline for existing user-linked records.
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
SELECT c.id, 'account_created', 'users', u.id::text, u.created_at FROM users u JOIN contacts c ON c.user_id = u.id ON CONFLICT DO NOTHING;
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, metadata, occurred_at)
SELECT c.id, 'newsletter_status', 'newsletter_subscribers', ns.id::text,
       jsonb_build_object('verified', ns.verified, 'unsubscribed', ns.unsubscribed_at IS NOT NULL), ns.created_at
FROM newsletter_subscribers ns JOIN contacts c ON c.normalized_email = lower(trim(ns.email)) ON CONFLICT DO NOTHING;
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
SELECT c.id, 'contact_message', 'contact_submissions', cs.id::text, cs.created_at
FROM contact_submissions cs JOIN contacts c ON c.normalized_email = lower(trim(cs.email)) ON CONFLICT DO NOTHING;
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
SELECT c.id, 'product_interest', 'product_leads', pl.id::text, pl.created_at
FROM product_leads pl JOIN contacts c ON c.user_id = pl.user_id ON CONFLICT DO NOTHING;
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
SELECT c.id, 'course_enrolled', 'course_enrollments', ce.id::text, ce.created_at FROM course_enrollments ce JOIN contacts c ON c.user_id = ce.user_id ON CONFLICT DO NOTHING;
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
SELECT c.id, 'payment_claim', 'payment_claims', pc.id::text, pc.created_at FROM payment_claims pc JOIN contacts c ON c.user_id = pc.user_id ON CONFLICT DO NOTHING;
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
SELECT c.id, 'community_membership', 'community_memberships', cm.id::text, cm.created_at FROM community_memberships cm JOIN contacts c ON c.user_id = cm.user_id ON CONFLICT DO NOTHING;
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
SELECT c.id, 'author_application', 'author_applications', aa.id::text, aa.created_at FROM author_applications aa JOIN contacts c ON c.user_id = aa.user_id ON CONFLICT DO NOTHING;
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
SELECT c.id, 'tool_submitted', 'directory_tools', dt.id::text, dt.created_at FROM directory_tools dt JOIN contacts c ON c.user_id = dt.submitted_by_user_id ON CONFLICT DO NOTHING;
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
SELECT c.id, 'review_submitted', 'review_submissions', rs.id::text, rs.created_at FROM review_submissions rs JOIN contacts c ON c.user_id = rs.user_id ON CONFLICT DO NOTHING;
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
SELECT c.id, 'community_post', 'forum_posts', fp.id::text, fp.created_at FROM forum_posts fp JOIN contacts c ON c.user_id = fp.user_id ON CONFLICT DO NOTHING;
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
SELECT c.id, 'community_comment', 'forum_comments', fc.id::text, fc.created_at FROM forum_comments fc JOIN contacts c ON c.user_id = fc.user_id ON CONFLICT DO NOTHING;
INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
SELECT c.id, 'voice_agent_lead', 'voice_leads', vl.id::text, vl.created_at
FROM voice_leads vl JOIN contacts c ON c.normalized_email = lower(trim(vl.email)) OR (vl.user_id IS NOT NULL AND c.user_id = vl.user_id)
WHERE vl.email IS NOT NULL OR vl.user_id IS NOT NULL ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS contact_segments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  rules JSONB NOT NULL DEFAULT '{"match":"all","rules":[]}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_segments_system_name
  ON contact_segments(lower(name)) WHERE is_system = true;

INSERT INTO contact_segments (name, description, rules, is_system) VALUES
('All marketable contacts', 'Verified newsletter subscribers who are not suppressed.', '{"match":"all","rules":[{"field":"marketing_status","operator":"equals","value":"subscribed"}]}', true),
('Engaged in the last 30 days', 'Marketable contacts who opened or clicked in the last 30 days.', '{"match":"all","rules":[{"field":"marketing_status","operator":"equals","value":"subscribed"},{"field":"last_engaged_days","operator":"within","value":"30"}]}', true),
('Engaged in the last 90 days', 'Marketable contacts who opened or clicked in the last 90 days.', '{"match":"all","rules":[{"field":"marketing_status","operator":"equals","value":"subscribed"},{"field":"last_engaged_days","operator":"within","value":"90"}]}', true),
('Never engaged', 'Marketable contacts who have never recorded an open or click.', '{"match":"all","rules":[{"field":"marketing_status","operator":"equals","value":"subscribed"},{"field":"never_engaged","operator":"equals","value":"true"}]}', true),
('Customers', 'Contacts with at least one approved payment.', '{"match":"all","rules":[{"field":"has_purchase","operator":"equals","value":"true"}]}', true)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS email_deliveries (
  id BIGSERIAL PRIMARY KEY,
  tracking_id UUID NOT NULL UNIQUE,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  template_key TEXT,
  category TEXT NOT NULL,
  campaign_id INTEGER REFERENCES newsletter_campaigns(id) ON DELETE SET NULL,
  flow_step_id INTEGER REFERENCES email_flow_steps(id) ON DELETE SET NULL,
  provider_message_id TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','delivered','failed','suppressed','bounced','complained','unsubscribed')),
  is_test BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  first_opened_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  open_count INTEGER NOT NULL DEFAULT 0,
  first_clicked_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ,
  click_count INTEGER NOT NULL DEFAULT 0,
  failed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_contact ON email_deliveries(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_campaign ON email_deliveries(campaign_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_deliveries_provider ON email_deliveries(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE email_events ADD COLUMN IF NOT EXISTS delivery_id BIGINT REFERENCES email_deliveries(id) ON DELETE SET NULL;
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS provider_event_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_provider_key ON email_events(provider_event_key)
  WHERE provider_event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_events_delivery ON email_events(delivery_id, created_at);

ALTER TABLE newsletter_campaigns
  ADD COLUMN IF NOT EXISTS segment_id INTEGER REFERENCES contact_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

UPDATE newsletter_campaigns
SET segment_id = (SELECT id FROM contact_segments WHERE name = 'All marketable contacts' AND is_system = true LIMIT 1)
WHERE segment_id IS NULL;

ALTER TABLE newsletter_sends
  ADD COLUMN IF NOT EXISTS contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_delivery_id BIGINT REFERENCES email_deliveries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS skipped_reason TEXT;
ALTER TABLE newsletter_sends ALTER COLUMN subscriber_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_sends_campaign_contact
  ON newsletter_sends(campaign_id, contact_id) WHERE contact_id IS NOT NULL;

ALTER TABLE email_flow_scheduled
  ADD COLUMN IF NOT EXISTS email_delivery_id BIGINT REFERENCES email_deliveries(id) ON DELETE SET NULL;

-- Backfill campaign snapshot identities where legacy rows exist.
UPDATE newsletter_sends s
SET contact_id = c.id
FROM newsletter_subscribers ns
JOIN contacts c ON c.normalized_email = lower(trim(ns.email))
WHERE s.subscriber_id = ns.id AND s.contact_id IS NULL;

COMMIT;
