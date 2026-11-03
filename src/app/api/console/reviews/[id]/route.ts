import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { escapeHtml } from "@/lib/escapeHtml";
import { deleteFromR2 } from "@/lib/r2Upload";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action, note } = await req.json();

  if (action === "approve" || action === "reject") {
    await pool.query("UPDATE review_submissions SET status = $1 WHERE id = $2", [
      action === "approve" ? "approved" : "rejected",
      id,
    ]);
    return NextResponse.json({ ok: true, status: action === "approve" ? "approved" : "rejected" });
  }

  if (action === "request_info") {
    if (!note || typeof note !== "string" || !note.trim()) {
      return NextResponse.json({ error: "A question/reason is required." }, { status: 400 });
    }

    const submissionResult = await pool.query(
      `SELECT r.name, u.email FROM review_submissions r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.id = $1`,
      [id]
    );
    const submission = submissionResult.rows[0];
    if (!submission) return NextResponse.json({ error: "Review not found." }, { status: 404 });
    if (!submission.email) {
      return NextResponse.json(
        { error: "This review has no linked account email to contact (submitted before login was required)." },
        { status: 400 }
      );
    }

    const tpl = await getEmailTemplate("review-question-to-author");
    const vars = { name: escapeHtml(submission.name), note: escapeHtml(note).replace(/\n/g, "<br>") };
    const sendResult = await sendEmail({
      to: submission.email,
      subject: applyTemplateVars(tpl.subject, vars),
      html: applyTemplateVars(tpl.body_html, vars),
      from: tpl.from_email,
      replyTo: process.env.ADMIN_EMAIL,
      templateKey: tpl.key,
      category: "fixed",
      trackOpens: tpl.track_opens,
    });
    if (!sendResult.ok) {
      return NextResponse.json({ error: "Failed to send email to reviewer." }, { status: 502 });
    }

    await pool.query(
      "UPDATE review_submissions SET status = 'needs_info', admin_note = $1 WHERE id = $2",
      [note, id]
    );
    return NextResponse.json({ ok: true, status: "needs_info" });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await pool.query("DELETE FROM review_submissions WHERE id = $1 RETURNING screenshots", [id]);
  const screenshots: string[] = result.rows[0]?.screenshots || [];
  await Promise.all(screenshots.map((url) => deleteFromR2(url)));

  return NextResponse.json({ ok: true });
}
