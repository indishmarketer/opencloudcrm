-- Professional on-demand webinar publishing and guest registration.
-- Additive except for widening the existing status/user constraints.

ALTER TABLE webinars ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS presenter_name TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS presenter_title TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS presenter_bio TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS presenter_image_url TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS key_takeaways JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS agenda JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS cta_label TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS cta_url TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS pending_mux_upload_id TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS pending_mux_asset_id TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS pending_mux_passthrough TEXT;

ALTER TABLE webinars DROP CONSTRAINT IF EXISTS webinars_status_check;
ALTER TABLE webinars ADD CONSTRAINT webinars_status_check
  CHECK (status IN ('draft', 'processing', 'ready', 'errored', 'published', 'archived'));
ALTER TABLE webinars ALTER COLUMN status SET DEFAULT 'draft';
UPDATE webinars SET status = 'draft'
WHERE status = 'processing' AND mux_upload_id IS NULL AND mux_asset_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_webinars_pending_mux_upload
  ON webinars(pending_mux_upload_id) WHERE pending_mux_upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webinars_public_order
  ON webinars(featured DESC, release_at DESC, created_at DESC) WHERE status = 'published';

ALTER TABLE webinar_access ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE webinar_access ADD COLUMN IF NOT EXISTS viewer_token_hash TEXT;
ALTER TABLE webinar_access ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;
ALTER TABLE webinar_access ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE webinar_access ADD COLUMN IF NOT EXISTS watch_seconds INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_webinar_access_contact_unique
  ON webinar_access(webinar_id, contact_id) WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_webinar_access_token_unique
  ON webinar_access(viewer_token_hash) WHERE viewer_token_hash IS NOT NULL;

INSERT INTO email_templates
  (key, category, label, description, subject, body_html, from_email, critical, track_opens)
VALUES
  ('webinar-registration-confirmation', 'webinars', 'Webinar access confirmation',
   'Sent after someone registers for an on-demand webinar.',
   $s$Your webinar is ready: {{webinar_title}}$s$,
   $b$<p>Hi {{first_name}},</p><p>Your access to <strong>{{webinar_title}}</strong> is ready.</p><p><a href="{{webinar_url}}">Watch the webinar</a></p><p>Save this email so you can return whenever it suits you.</p>$b$,
   'academy@example.com', false, true)
ON CONFLICT (key) DO NOTHING;
