import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/email";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { escapeHtml } from "@/lib/escapeHtml";
import { raiseInboxAlert } from "@/lib/systemAlerts";
import { extractYoutubeId } from "@/lib/youtube";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { isOwnedR2Url } from "@/lib/r2Upload";

const MAX_SCREENSHOTS = 4;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(`review-submit:${session.userId}`, 5, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  const { role, website, rating, message, screenshots, youtubeUrl, turnstileToken } = await req.json();

  if (typeof message !== "string" || !message.trim() || message.length > 3000) {
    return NextResponse.json({ error: "Review message is required." }, { status: 400 });
  }
  if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
    return NextResponse.json({ error: "Choose a rating from 1 to 5." }, { status: 400 });
  }
  if (website && typeof website === "string") {
    try { const parsed = new URL(website); if (!['http:','https:'].includes(parsed.protocol)) throw new Error(); }
    catch { return NextResponse.json({ error: "Enter a valid website URL." }, { status: 400 }); }
  }

  const cleanScreenshots = Array.isArray(screenshots)
    ? screenshots
        .filter((s): s is string => typeof s === "string" && isOwnedR2Url(s))
        .slice(0, MAX_SCREENSHOTS)
    : [];

  const youtubeId = youtubeUrl && typeof youtubeUrl === "string" ? extractYoutubeId(youtubeUrl) : null;
  if (youtubeUrl && typeof youtubeUrl === "string" && youtubeUrl.trim() && !youtubeId) {
    return NextResponse.json({ error: "Couldn't recognize that as a YouTube link." }, { status: 400 });
  }

  const ip = req.headers.get("cf-connecting-ip") || undefined;
  const humanVerified = await verifyTurnstile(turnstileToken, ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human." }, { status: 400 });
  }

  const userRow = await pool.query("SELECT name FROM users WHERE id = $1", [session.userId]);
  const name = userRow.rows[0]?.name || session.email;

  const inserted = await pool.query(
    `INSERT INTO review_submissions (user_id, name, role, website, rating, message, screenshots, youtube_id,source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,'WEBSITE') RETURNING id`,
    [
      session.userId,
      String(name).slice(0, 200),
      String(role || "").slice(0, 200),
      String(website || "").slice(0, 300),
      Math.min(5, Math.max(1, Number(rating) || 5)),
      String(message).slice(0, 3000),
      cleanScreenshots,
      youtubeId,
    ]
  );
  emitWebhookEvent({
    eventType: "review.submitted",
    source: "review_submissions",
    sourceRecordId: inserted.rows[0].id,
    contactEmail: session.email,
    contactName: name,
    userId: session.userId,
    data: { review_id: inserted.rows[0].id, rating: Math.min(5, Math.max(1, Number(rating) || 5)), role: role || null },
  }).catch(() => {});

  const receivedTpl = await getEmailTemplate("review-submission-received");
  const receivedVars = { first_name: escapeHtml(String(name).trim().split(/\s+/)[0] || "there") };
  await sendEmail({
    to: session.email,
    subject: applyTemplateVars(receivedTpl.subject, receivedVars),
    html: applyTemplateVars(receivedTpl.body_html, receivedVars),
    from: receivedTpl.from_email,
    templateKey: receivedTpl.key,
    category: "fixed",
    trackOpens: receivedTpl.track_opens,
  });

  raiseInboxAlert({
    kind: "review_submitted",
    dedupeKey: `review_submitted:${session.userId}:${Date.now()}`,
    title: "A new review came in",
    detail: `From ${session.email}.`,
    link: "/console/reviews",
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
