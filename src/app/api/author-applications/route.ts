import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escapeHtml";
import { raiseInboxAlert } from "@/lib/systemAlerts";
import { getPendingApplication } from "@/lib/authorApplications";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { emitWebhookEvent } from "@/lib/webhookEvents";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(`author-application:${session.userId}`, 3, 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many applications. Try again later." }, { status: 429 });
  }

  const existing = await getPendingApplication(session.userId);
  if (existing) {
    return NextResponse.json({ error: "You already have an application under review." }, { status: 409 });
  }

  const { topics, sampleUrl } = await req.json();
  if (!topics || typeof topics !== "string" || !topics.trim()) {
    return NextResponse.json({ error: "Tell us what you'd want to write about." }, { status: 400 });
  }

  const result = await pool.query(
    `INSERT INTO author_applications (user_id, topics, sample_url)
     VALUES ($1, $2, $3) RETURNING id`,
    [session.userId, topics.slice(0, 3000), sampleUrl ? String(sampleUrl).slice(0, 500) : null]
  );

  const applicant = await pool.query("SELECT name FROM users WHERE id = $1", [session.userId]);
  emitWebhookEvent({
    eventType: "author_application.submitted",
    source: "author_applications",
    sourceRecordId: result.rows[0].id,
    contactEmail: session.email,
    contactName: applicant.rows[0]?.name || null,
    userId: session.userId,
    data: { application_id: result.rows[0].id, topics: topics.slice(0, 1000), sample_url: sampleUrl || null },
  }).catch(() => {});
  const receivedTpl = await getEmailTemplate("author-application-received");
  const receivedVars = { first_name: escapeHtml((applicant.rows[0]?.name || "there").trim().split(/\s+/)[0]) };
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
    kind: "author_application",
    dedupeKey: `author_application:${result.rows[0].id}`,
    title: "Someone applied to write for the blog",
    detail: `From ${session.email}.`,
    link: "/console/blog/applications",
  }).catch(() => {});
  return NextResponse.json({ ok: true, id: result.rows[0].id });
}
