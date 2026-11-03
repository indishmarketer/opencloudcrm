CREATE TABLE IF NOT EXISTS voice_agent_business_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL CHECK (char_length(company) BETWEEN 1 AND 120),
  role TEXT NOT NULL CHECK (char_length(role) BETWEEN 1 AND 120),
  website TEXT CHECK (website IS NULL OR char_length(website) <= 300),
  category TEXT NOT NULL CHECK (
    category IN (
      'agency',
      'consulting',
      'ecommerce',
      'education',
      'healthcare',
      'local-business',
      'real-estate',
      'saas',
      'other'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
