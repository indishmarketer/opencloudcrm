import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail, isSameOriginPost } from "@/lib/auth";
import { isAuthorizedConsoleEmail, isConsoleOwner } from "@/lib/consoleAdmins";
import { regenerateRecoveryCodes, resetMfa, verifyMfaCode } from "@/lib/consoleMfa";
import { consumeRateLimit, privateRateLimitKey } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);

  if (body?.action === "regenerate") {
    if (!(await consumeRateLimit(`console-2fa:${privateRateLimitKey(adminEmail)}`, 6, 15 * 60 * 1000))) {
      return NextResponse.json({ error: "Too many attempts. Wait 15 minutes and try again." }, { status: 429 });
    }
    const code = typeof body.code === "string" ? body.code.slice(0, 40) : "";
    // A recovery code can't be used to mint new recovery codes.
    if ((await verifyMfaCode(adminEmail, code)) !== "totp") {
      return NextResponse.json({ error: "Enter the current 6-digit code from your authenticator app." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, recoveryCodes: await regenerateRecoveryCodes(adminEmail) });
  }

  if (body?.action === "reset-self") {
    // New phone: prove it's you with the old app's code or a recovery code,
    // then the next login sets up the new authenticator.
    if (!(await consumeRateLimit(`console-2fa:${privateRateLimitKey(adminEmail)}`, 6, 15 * 60 * 1000))) {
      return NextResponse.json({ error: "Too many attempts. Wait 15 minutes and try again." }, { status: 429 });
    }
    const code = typeof body.code === "string" ? body.code.slice(0, 40) : "";
    if (!(await verifyMfaCode(adminEmail, code))) {
      return NextResponse.json({ error: "Enter a current code from your app, or one of your recovery codes." }, { status: 400 });
    }
    await resetMfa(adminEmail);
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "reset") {
    const target = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!isConsoleOwner(adminEmail)) return NextResponse.json({ error: "Only the owner can do this." }, { status: 403 });
    if (!target || isConsoleOwner(target) || !(await isAuthorizedConsoleEmail(target))) {
      return NextResponse.json({ error: "That isn't a team member." }, { status: 400 });
    }
    await resetMfa(target);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
