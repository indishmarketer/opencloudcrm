-- Reusable schedules and timed room interactions for every webinar.

CREATE TABLE IF NOT EXISTS webinar_schedules (
  id BIGSERIAL PRIMARY KEY,
  webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
  schedule_kind TEXT NOT NULL CHECK (schedule_kind IN ('weekly', 'specific')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  weekdays SMALLINT[] NOT NULL DEFAULT '{}',
  specific_date DATE,
  local_time TIME NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (schedule_kind = 'weekly' AND cardinality(weekdays) > 0 AND specific_date IS NULL) OR
    (schedule_kind = 'specific' AND cardinality(weekdays) = 0 AND specific_date IS NOT NULL)
  ),
  CHECK (weekdays <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[])
);
CREATE INDEX IF NOT EXISTS idx_webinar_schedules_webinar_active
  ON webinar_schedules(webinar_id, active);

CREATE TABLE IF NOT EXISTS webinar_timed_events (
  id BIGSERIAL PRIMARY KEY,
  webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('quiz', 'cta')),
  trigger_seconds INTEGER NOT NULL CHECK (trigger_seconds >= 0),
  title TEXT NOT NULL,
  body TEXT,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_option INTEGER,
  cta_label TEXT,
  cta_url TEXT,
  display_mode TEXT NOT NULL DEFAULT 'popup' CHECK (display_mode IN ('popup', 'chat', 'both')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (event_type = 'quiz' AND jsonb_typeof(options) = 'array' AND jsonb_array_length(options) >= 2 AND cta_label IS NULL AND cta_url IS NULL) OR
    (event_type = 'cta' AND options = '[]'::jsonb AND correct_option IS NULL AND cta_label IS NOT NULL AND cta_url IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_webinar_timed_events_webinar_trigger
  ON webinar_timed_events(webinar_id, trigger_seconds) WHERE active = true;

CREATE TABLE IF NOT EXISTS webinar_quiz_responses (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES webinar_timed_events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selected_option INTEGER NOT NULL CHECK (selected_option >= 0),
  is_correct BOOLEAN,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE webinar_access
  ADD COLUMN IF NOT EXISTS session_start_at TIMESTAMPTZ;
