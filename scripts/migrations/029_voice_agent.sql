-- Voice agent product: live call sessions, extracted post-call leads, and
-- live-switchable model settings (read by voice-agent-server on every
-- turn, no redeploy needed to change providers). Shared Postgres with the
-- main app -- the separate voice-agent-server service reads/writes these
-- same tables via DATABASE_URL, it does not run its own migrations.
--
-- Per-user business info lives in `voice_agent_business_profiles`
-- (migration 030, built independently by Nova/T-006) -- not duplicated
-- here, see api/voice-agent/token/route.ts which checks that table.

CREATE TABLE IF NOT EXISTS voice_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_hash TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  end_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_user_started ON voice_sessions(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS voice_leads (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  problem TEXT,
  interest TEXT,
  transcript TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plain key/value, same pattern as the existing `settings` table
-- elsewhere in this app -- keys: text_provider ('gemini'|'openai'|
-- 'pollinations'), text_model, voice_model_id (Fish Audio reference id),
-- transcription_provider ('assemblyai'|'pollinations').
CREATE TABLE IF NOT EXISTS voice_agent_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO voice_agent_settings (key, value) VALUES
  ('text_provider', 'gemini'),
  ('text_model', 'gemini-2.5-flash'),
  ('transcription_provider', 'assemblyai')
ON CONFLICT (key) DO NOTHING;
