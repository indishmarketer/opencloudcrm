-- Owner's request (2026-08-22): the console's leads view should show a
-- short AI-written conversation summary instead of raw extracted fields
-- and the full transcript. Add a column for it rather than computing on
-- every page load -- generated once at extraction time in leads.js.
ALTER TABLE voice_leads ADD COLUMN IF NOT EXISTS summary TEXT;
