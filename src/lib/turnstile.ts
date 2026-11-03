export async function verifyTurnstile(token: string | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // A missing secret in production must fail closed -- silently
    // returning true here would mean an env var deletion/misconfig
    // disables bot protection on every route site-wide with no error.
    if (process.env.NODE_ENV === "production") {
      console.error("TURNSTILE_SECRET_KEY not set in production -- rejecting request.");
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
