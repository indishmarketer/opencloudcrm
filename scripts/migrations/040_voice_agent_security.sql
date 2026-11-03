CREATE TABLE IF NOT EXISTS voice_call_tokens (
  jti UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  stt_issued_at TIMESTAMPTZ,
  session_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_call_tokens_expiry ON voice_call_tokens(expires_at);
