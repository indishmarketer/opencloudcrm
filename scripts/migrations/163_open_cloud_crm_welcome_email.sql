-- This migration used to seed an "Open Cloud CRM welcome" email template
-- tied to the original project maintainer's own OpenCloudCRM-marketing
-- landing-page webhook (/api/webhooks/open-cloud-crm). That's specific to
-- that one deployment's own use of this product, not a generic CRM
-- feature -- every other self-hosted install (a health coach, a spiritual
-- coach, anyone not marketing OpenCloudCRM itself) just saw a cryptic
-- "Open Cloud CRM leads" category/email in their console with nothing to
-- do with their business. Intentionally a no-op now; kept as a file so the
-- migration numbering stays stable for installs that already ran it.
SELECT 1;
