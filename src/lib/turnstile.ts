export async function verifyTurnstile(token: string | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Site key also unset -- this deployment has never set up Turnstile at
    // all (the common case for a fresh self-hosted install), so the client
    // widget never renders and never produces a token. Treat verification
    // as not required rather than rejecting every signup/login forever.
    if (!process.env.TURNSTILE_SITE_KEY) return true;
    // Site key IS set but the secret vanished -- a misconfig (e.g. an env
    // var accidentally deleted), not a deliberate "Turnstile disabled"
    // choice. Fail closed in production: silently returning true here
    // would mean that misconfig disables bot protection site-wide with no
    // error.
    if (process.env.NODE_ENV === "production") {
      console.error("TURNSTILE_SECRET_KEY not set in production despite a site key being configured -- rejecting request.");
      return false;
    }
    return true; // dev-only bypass, no Turnstile key needed locally
  }
  if (!token) return false;

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token, remoteip: ip }),
  });
  const data = await res.json();
  return !!data.success;
}
