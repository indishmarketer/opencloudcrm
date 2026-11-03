-- Adds magic-link support alongside the existing 6-digit code: a long
-- random single-use token stored on the same row, so whichever the user
-- uses first (typing the code or clicking the link) invalidates the other.
-- `payload` carries whatever a purpose needs to complete verification
-- independent of the browser that requested it (e.g. the contact form's
-- name/message, so a magic link clicked from a different device/session
-- still has everything it needs).
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS link_token TEXT;
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS payload JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_codes_link_token ON otp_codes(link_token) WHERE link_token IS NOT NULL;
