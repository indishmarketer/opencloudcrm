-- The new visual email builder (src/components/emailBuilder/ConsoleEmailBuilder.tsx)
-- stores its structured blocks here, on both the reusable library/campaign
-- templates AND the fixed, code-linked transactional templates -- the user's
-- own example of a broken email (a confirmation link) was one of the latter.
--
-- `body_html` stays the single value every existing reader (sendEmail(),
-- the campaign editor's template-copy) already knows how to use: when
-- `blocks_json` is present, the server regenerates `body_html` from it on
-- every save (src/lib/emailBlocksRender.ts's renderEmailBlocksToHtml), so
-- nothing downstream needs to change. A template with no `blocks_json`
-- (every template that exists before this migration) keeps opening in the
-- existing plain rich-text editor -- this is a one-way upgrade a template
-- opts into, never a silent conversion of its existing hand-written HTML.

BEGIN;

ALTER TABLE email_content_templates ADD COLUMN IF NOT EXISTS blocks_json jsonb;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS blocks_json jsonb;

COMMENT ON COLUMN email_content_templates.blocks_json IS
  'The visual builder''s structured blocks (src/lib/emailBlocks.ts). NULL means this template was never opened in the builder -- body_html is still hand-written/rich-text and is the source of truth. Once set, body_html is regenerated from this on every save.';
COMMENT ON COLUMN email_templates.blocks_json IS
  'Same as email_content_templates.blocks_json, for the fixed transactional templates.';

COMMIT;
