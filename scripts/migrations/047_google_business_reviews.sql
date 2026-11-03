BEGIN;

ALTER TABLE review_submissions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'WEBSITE'
    CHECK (source = 'WEBSITE');

CREATE TABLE IF NOT EXISTS google_business_connections (
  id BIGSERIAL PRIMARY KEY,
  connected_by_email TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  access_token_encrypted TEXT,
  access_token_expires_at TIMESTAMPTZ,
  granted_scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'configuring'
    CHECK (status IN ('configuring','connected','expired','error','disconnected')),
  last_error TEXT,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_google_business_connection
  ON google_business_connections ((true)) WHERE disconnected_at IS NULL;

CREATE TABLE IF NOT EXISTS google_business_locations (
  id BIGSERIAL PRIMARY KEY,
  connection_id BIGINT NOT NULL REFERENCES google_business_connections(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  location_name TEXT NOT NULL,
  title TEXT NOT NULL,
  address_text TEXT,
  place_id TEXT,
  review_url TEXT,
  selected BOOLEAN NOT NULL DEFAULT false,
  show_publicly BOOLEAN NOT NULL DEFAULT false,
  average_rating NUMERIC(3,2),
  total_review_count INTEGER,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, location_name)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_selected_google_business_location
  ON google_business_locations ((true)) WHERE selected = true;

-- Google API content is a short-lived cache. The sync code deletes rows at
-- expires_at and refreshes retained content, complying with Google's cache rules.
CREATE TABLE IF NOT EXISTS google_reviews (
  resource_name TEXT PRIMARY KEY,
  location_id BIGINT NOT NULL REFERENCES google_business_locations(id) ON DELETE CASCADE,
  review_id TEXT,
  reviewer_name TEXT,
  reviewer_photo_url TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  star_rating INTEGER NOT NULL CHECK (star_rating BETWEEN 1 AND 5),
  comment TEXT,
  create_time TIMESTAMPTZ,
  update_time TIMESTAMPTZ,
  reply_comment TEXT,
  reply_update_time TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX IF NOT EXISTS idx_google_reviews_location_updated
  ON google_reviews(location_id, update_time DESC);

CREATE TABLE IF NOT EXISTS review_requests (
  id BIGSERIAL PRIMARY KEY,
  tracking_id UUID NOT NULL UNIQUE,
  contact_id BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES google_business_locations(id) ON DELETE RESTRICT,
  template_key TEXT NOT NULL REFERENCES email_templates(key) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','suppressed','failed','cancelled')),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  email_delivery_id BIGINT REFERENCES email_deliveries(id) ON DELETE SET NULL,
  automation_flow_id INTEGER REFERENCES email_flows(id) ON DELETE SET NULL,
  automation_run_id BIGINT REFERENCES email_flow_runs(id) ON DELETE SET NULL,
  automation_step_id INTEGER REFERENCES email_flow_steps(id) ON DELETE SET NULL,
  requested_by_email TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_requests_due
  ON review_requests(status, scheduled_for) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_review_requests_contact
  ON review_requests(contact_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS one_review_request_per_automation_step
  ON review_requests(automation_run_id, automation_step_id)
  WHERE automation_run_id IS NOT NULL AND automation_step_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS google_business_oauth_states (
  state_hash TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS google_business_sync_events (
  event_key TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  resource_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS google_business_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_email TEXT,
  action TEXT NOT NULL,
  resource_name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_google_business_audit_created ON google_business_audit_log(created_at DESC);

ALTER TABLE email_flow_steps
  ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'email'
    CHECK (action_type IN ('email','google_review_request')),
  ADD COLUMN IF NOT EXISTS review_template_key TEXT REFERENCES email_templates(key) ON DELETE RESTRICT;

INSERT INTO email_templates
  (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars)
VALUES
  ('google-review-request', 'reviews', 'Google review request',
   'Requests an honest Google review after a completed customer experience.',
   'Would you share your honest experience?',
   '<p>Hi {{first_name}},</p><p>Thank you for choosing Indish Marketer. If you have a moment, please share an honest review of your experience on Google.</p><p><a href="{{google_review_url}}">Leave a Google review</a></p><p>Your honest feedback helps us improve. No incentive is offered and every rating is welcome.</p>',
   'support@example.com', false, true, ARRAY['first_name','google_review_url']),
  ('google-review-reminder', 'reviews', 'Google review request reminder',
   'A single polite reminder for people who did not click the first request.',
   'A quick reminder: share your honest feedback',
   '<p>Hi {{first_name}},</p><p>If you would still like to share feedback about your experience, you can leave an honest Google review here:</p><p><a href="{{google_review_url}}">Leave a Google review</a></p><p>Please ignore this message if you have already reviewed us.</p>',
   'support@example.com', false, true, ARRAY['first_name','google_review_url'])
ON CONFLICT (key) DO NOTHING;

COMMIT;
