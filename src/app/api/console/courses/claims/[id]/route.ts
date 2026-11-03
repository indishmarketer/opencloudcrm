import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sendEmailWithRetry } from "@/lib/emailOutbox";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { triggerEmailFlow, firstNameOf } from "@/lib/emailAutomation";
import { escapeHtml } from "@/lib/escapeHtml";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { SITE_URL } from "@/config/brand";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const claimId = Number(id);
  const { status } = await req.json();
  if (!Number.isInteger(claimId) || !["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const claimResult = await pool.query(
    `UPDATE payment_claims SET status = $1, reviewed_at = now()
     WHERE id = $2 AND status = 'pending'
     RETURNING user_id, course_id`,
    [status, claimId]
  );
  const claim = claimResult.rows[0];
  if (!claim) return NextResponse.json({ error: "Claim not found or already reviewed." }, { status: 404 });

  const claimantRow = await pool.query("SELECT email, name FROM users WHERE id = $1", [claim.user_id]);
  emitWebhookEvent({
    eventType: "payment_claim.resolved",
    source: "payment_claims",
    sourceRecordId: claimId,
    contactEmail: claimantRow.rows[0]?.email || null,
    contactName: claimantRow.rows[0]?.name || null,
    userId: claim.user_id,
    data: { claim_id: claimId, course_id: claim.course_id, status },
  }).catch(() => {});

  if (status === "approved") {
    // Captured BEFORE the upsert below so we know whether this is a fresh
    // PRO purchase or an upgrade from an existing free enrollment, matching
    // the same distinction the Razorpay/PayPal webhooks make.
    const priorEnrollment = await pool.query(
      "SELECT tier FROM course_enrollments WHERE user_id = $1 AND course_id = $2",
      [claim.user_id, claim.course_id]
    );
    const wasFreeBefore = priorEnrollment.rows[0]?.tier === "free";

    await pool.query(
      `INSERT INTO course_enrollments (user_id, course_id, tier, granted_via)
       VALUES ($1, $2, 'pro', 'manual')
       ON CONFLICT (user_id, course_id) DO UPDATE SET tier = 'pro', granted_via = 'manual'`,
      [claim.user_id, claim.course_id]
    );

    const info = await pool.query(
      `SELECT u.email, u.name, c.title, c.slug, pc.method, pc.reference, pc.amount, pc.currency
       FROM users u, courses c, payment_claims pc WHERE u.id = $1 AND c.id = $2 AND pc.id = $3`,
      [claim.user_id, claim.course_id, claimId]
    );
    const row = info.rows[0];
    if (row) {
      const tpl = await getEmailTemplate("course-access-granted-claim-approved");
      const vars = {
        first_name: escapeHtml(firstNameOf(row.name)),
        course_title: escapeHtml(row.title),
        course_url: `${SITE_URL}/account/courses/${encodeURIComponent(row.slug)}`,
      };
      await sendEmailWithRetry({
        to: row.email,
        subject: applyTemplateVars(tpl.subject, vars),
        html: applyTemplateVars(tpl.body_html, vars),
        from: tpl.from_email,
        templateKey: tpl.key,
        category: "fixed",
        trackOpens: tpl.track_opens,
      });
      triggerEmailFlow(
        wasFreeBefore ? "course_upgrade_to_pro" : "course_purchase",
        row.email,
        {
          course_title: row.title,
          course_url: `${SITE_URL}/courses/${row.slug}`,
          first_name: firstNameOf(row.name),
          payment_amount: row.amount == null ? "" : String(row.amount),
          payment_currency: row.currency || "",
          payment_method: row.method || "manual",
          payment_reference: row.reference || "",
        },
        claim.course_id
      ).catch(() => {});
      emitWebhookEvent({
        eventType: wasFreeBefore ? "course.upgraded" : "course.enrolled",
        source: "course_enrollments",
        sourceRecordId: `${claim.user_id}:${claim.course_id}`,
        contactEmail: row.email,
        contactName: row.name,
        userId: claim.user_id,
        data: { course_id: claim.course_id, course_title: row.title, course_slug: row.slug, tier: "pro", method: "manual" },
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
