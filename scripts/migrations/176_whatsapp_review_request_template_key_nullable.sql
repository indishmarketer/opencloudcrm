BEGIN;

-- WhatsApp review requests carry their template in whatsapp_template_key, so
-- template_key (an email-template foreign key) is no longer required. This
-- lets a WhatsApp-only review request queue without a template_key.
ALTER TABLE review_requests ALTER COLUMN template_key DROP NOT NULL;

COMMIT;
