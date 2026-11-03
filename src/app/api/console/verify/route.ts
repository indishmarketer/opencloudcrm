import { NextRequest, NextResponse } from "next/server";
import { verifyMagicLinkToken, createAdminSession, createPendingMfaSession, consoleMfaRequired, isSameOriginPost } from "@/lib/auth";
import { isAuthorizedConsoleEmail } from "@/lib/consoleAdmins";
import { SITE_URL } from "@/config/brand";

/** Opening the emailed link only shows a sign-in button, so a mail
 * scanner that fetches the link can't spend it or receive the admin
 * session. The button POSTs here. */
export async function GET(req: NextRequest) {
  const params = new URLSearchParams({ token: req.nextUrl.searchParams.get("token") || "" });
  return NextResponse.redirect(new URL(`/console/login/confirm?${params}`, SITE_URL));
}

export async function POST(req: NextRequest) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") || "");
  const email = token ? await verifyMagicLinkToken(token) : null;

  // Re-check authorization at verify time too, in case access was revoked
  // in the window between requesting the link and clicking it.
  if (!email || !(await isAuthorizedConsoleEmail(email))) {
    return NextResponse.redirect(new URL("/console/login?error=expired", SITE_URL), 303);
  }

  // The email link proves the inbox; the authenticator code is the second step.
  if (consoleMfaRequired()) {
    await createPendingMfaSession(email);
    return NextResponse.redirect(new URL("/console/login/2fa", SITE_URL), 303);
  }
  await createAdminSession(email);
  return NextResponse.redirect(new URL("/console", SITE_URL), 303);
}
