-- Persists slow/rate-limited external analytics responses (starting with
-- Microsoft Clarity, whose export API enforces a strict daily quota)
-- across deploys. The previous in-memory cache reset on every redeploy,
-- which happens several times a day, so it almost never survived long
-- enough to actually save a request.
CREATE TABLE IF NOT EXISTS analytics_cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
