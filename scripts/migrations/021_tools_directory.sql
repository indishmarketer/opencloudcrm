-- Tools directory: categories, listings, and hashed API keys for external
-- publishing (n8n, Claude, or any other automation posting new listings).

CREATE TABLE IF NOT EXISTS api_tokens (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  scope TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS directory_categories (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS directory_tools (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  category_id INTEGER NOT NULL REFERENCES directory_categories(id),
  subcategory TEXT,
  pricing_type TEXT NOT NULL CHECK (pricing_type IN ('free', 'freemium', 'paid', 'free_api', 'paid_api')),
  website_url TEXT NOT NULL,
  logo_url TEXT,
  screenshots TEXT[] NOT NULL DEFAULT '{}',
  featured BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api')),
  submitted_via_token_id INTEGER REFERENCES api_tokens(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_directory_tools_category ON directory_tools(category_id);
CREATE INDEX IF NOT EXISTS idx_directory_tools_status ON directory_tools(status);
