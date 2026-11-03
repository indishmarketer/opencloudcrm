import { NextRequest, NextResponse } from "next/server";
import { createAdminSession, clearPendingMfaSession, getPendingMfaEmail, isSameOriginPost } from "@/lib/auth";
import { confirmEnrollment, getMfaStatus, verifyMfaCode } from "@/lib/consoleMfa";
import { consumeRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { raiseAlert } from "@/lib/systemAlerts";
import { SITE_NAME } from "@/config/brand";

/** Second login step: the code from the authenticator app (or a recovery
 * code). On first login the same code also finishes setup. */
export async function POST(req: NextRequest) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const email = await getPendingMfaEmail();
  if (!email) {
    return NextResponse.json({ error: "Your login link expired. Request a new one.", restart: true }, { status: 401 });
  }

  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const [perEmail, perIp] = await Promise.all([
    consumeRateLimit(`console-2fa:${privateRateLimitKey(email)}`, 6, 15 * 60 * 1000),
    consumeRateLimit(`console-2fa-ip:${ip}`, 20, 15 * 60 * 1000),
  ]);
  if (!perEmail || !perIp) {
    return NextResponse.json({ error: "Too many attempts. Wait 15 minutes and try again." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.slice(0, 40) : "";
  if (!code.trim()) return NextResponse.json({ error: "Enter the code." }, { status: 400 });

  const status = await getMfaStatus(email);
  if (!status.enabled) {
    const recoveryCodes = await confirmEnrollment(email, code);
    if (!recoveryCodes) {
      return NextResponse.json({ error: `That code didn't match. Check the app shows ${SITE_NAME} Console and try the newest code.` }, { status: 400 });
    }
    await createAdminSession(email);
    await clearPendingMfaSession();
    return NextResponse.json({ ok: true, recoveryCodes });
  }

  const method = await verifyMfaCode(email, code);
  if (!method) return NextResponse.json({ error: "That code didn't match. Try the newest code from your app." }, { status: 400 });
  if (method === "recovery") {
    await raiseAlert({
      kind: "mfa_recovery_used",
      dedupeKey: `mfa_recovery_used:${email}:${Date.now()}`,
      title: `${email} signed in to the console with a recovery code`,
      detail: "If that wasn't you, remove their access in Team and reset their 2-step login in Security. Otherwise create new recovery codes in Security.",
      link: "/console/security",
    });
  }
  await createAdminSession(email);
  await clearPendingMfaSession();
  return NextResponse.json({ ok: true });
}
