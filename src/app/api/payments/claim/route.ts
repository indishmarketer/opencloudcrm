import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool, withTransaction } from "@/lib/db";
import { sendEmailWithRetry } from "@/lib/emailOutbox";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { escapeHtml } from "@/lib/escapeHtml";
import { consumeRateLimit } from "@/lib/rateLimit";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { z } from "zod";

const ClaimSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  method: z.literal("manual"),
  reference: z.string().trim().min(3).max(100).regex(/^[\p{L}\p{N} ._:/+\-]+$/u),
}).strict();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await consumeRateLimit(`payment-claim:${session.userId}`, 3, 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many payment claims." }, { status: 429 });
  }

  const parsed = ClaimSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment claim." }, { status: 400 });
  const { courseId, method, reference } = parsed.data;

  const course = await pool.query("SELECT title FROM courses WHERE id = $1 AND published = true", [courseId]);
  if (course.rowCount !== 1) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  const inserted = await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [session.userId]);
    const existing = await client.query(
      `SELECT 1 FROM payment_claims
       WHERE user_id = $1 AND course_id = $2 AND method = 'manual' AND status = 'pending'`,
      [session.userId, courseId],
    );
    if (existing.rowCount) return null;
    const result = await client.query(
      `INSERT INTO payment_claims (user_id, course_id, method, reference)
       VALUES ($1, $2, 'manual', $3) RETURNING id`,
      [session.userId, courseId, reference],
    );
    return result.rows[0].id as number;
  });
  if (!inserted) {
    return NextResponse.json({ error: "A payment claim is already pending." }, { status: 409 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const tpl = await getEmailTemplate("payment-claim-admin-notify");
    const vars = {
      email: escapeHtml(session.email),
      method: escapeHtml(String(method)),
      reference: escapeHtml(String(reference)),
    };
    await sendEmailWithRetry({
      to: adminEmail,
      subject: applyTemplateVars(tpl.subject, vars),
      html: applyTemplateVars(tpl.body_html, vars),
      from: tpl.from_email,
      replyTo: session.email,
      templateKey: tpl.key,
      category: "fixed",
      trackOpens: tpl.track_opens,
    });
  }

  const user = await pool.query("SELECT name FROM users WHERE id = $1", [session.userId]);
  emitWebhookEvent({
    eventType: "payment_claim.submitted",
    source: "payment_claims",
    sourceRecordId: inserted,
    contactEmail: session.email,
    contactName: user.rows[0]?.name || null,
    userId: session.userId,
    data: { claim_id: inserted, course_id: courseId, course_title: course.rows[0].title, method, reference },
  }).catch(() => {});
  const receivedTpl = await getEmailTemplate("payment-claim-received");
  const receivedVars = {
    first_name: escapeHtml((user.rows[0]?.name || "there").trim().split(/\s+/)[0]),
    course_title: escapeHtml(course.rows[0].title),
  };
  await sendEmailWithRetry({
    to: session.email,
    subject: applyTemplateVars(receivedTpl.subject, receivedVars),
    html: applyTemplateVars(receivedTpl.body_html, receivedVars),
    from: receivedTpl.from_email,
    templateKey: receivedTpl.key,
    category: "fixed",
    trackOpens: receivedTpl.track_opens,
  });

  return NextResponse.json({ ok: true });
}
