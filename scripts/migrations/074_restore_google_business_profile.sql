BEGIN;

-- Google approved the Business Profile API allowlist request on 2026-09-17
-- (300 QPM default quota) after the prior 10+ day wait led to fully
-- ripping this out in migration 062.
-- Recreates the same schema migration 047 originally created (queried from
-- git history at commit c3eabe2a, the last commit before removal), with one
-- deliberate change: review_requests.location_id is NOT restored. The
-- link-based request pipeline built during the removal (site_settings key
-- google_review_url, src/lib/reviewRequests.ts) works fine standing alone
-- and every other table/route already depends on it -- reintroducing a
-- location_id FK there would just be dead weight. Instead, saving a
-- location's official review link (via the location PATCH route) also
-- writes it into site_settings, so the two stay in sync automatically.

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

COMMIT;
