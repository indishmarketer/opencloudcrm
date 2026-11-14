-- Removes the OpenCloudCRM project's own lead-capture feature: a webhook
-- slug ("open-cloud-crm") + welcome email + inbox alert built for the
-- original project's own signup funnel, which ended up shipped live to
-- every self-hosted install -- including this one. Migration 164
-- (164_reclassify_retired_waitlist_leads.sql) already cleaned up two
-- sibling rows (open-source-otp/open-source-confirmed) the same way; this
-- is the equivalent cleanup for the one it missed.
--
-- The generic inbound-webhook-to-contact pipeline (any slug, activity_type
-- 'webhook_lead') is a real, useful self-hoster feature and is untouched --
-- only the one feature that was specifically about the OpenCloudCRM
-- project's own funnel is removed.

BEGIN;

DELETE FROM email_templates WHERE key = 'open-cloud-crm-welcome';

COMMIT;
