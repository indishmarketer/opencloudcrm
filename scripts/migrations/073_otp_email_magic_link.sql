-- Adds a magic-link confirm button above the existing 6-digit code, so a
-- recipient can either click through or type the code manually. Both stay
-- visible on purpose: a link-prefetching corporate email security scanner
-- (Microsoft Defender Safe Links, Proofpoint, etc.) can silently consume a
-- single-use link before the real user clicks it, so the code is a
-- necessary fallback, not just a UX nicety.
UPDATE email_templates SET
  body_html = $b$<p>Click the button below to confirm instantly:</p><p><a href="{{magic_link_url}}" class="email-cta" style="display:inline-block;white-space:nowrap;background:#0a0a0a;color:#f7f4f0;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Confirm now</a></p><p>Or enter this code manually if you'd rather:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">{{code}}</p><p>This link and code both expire in 10 minutes. If you didn't request this, ignore it.</p>$b$,
  allowed_vars = ARRAY['code', 'magic_link_url'],
  updated_at = now()
WHERE key = 'otp-code';
