import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { escapeHtml } from "@/lib/escapeHtml";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { message } = await req.json();
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Reply message is required." }, { status: 400 });
  }

  const result = await pool.query(
    "SELECT name, email FROM contact_submissions WHERE id = $1",
    [id]
  );
  const submission = result.rows[0];
  if (!submission) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  const tpl = await getEmailTemplate("contact-form-reply");
  const vars = { name: escapeHtml(submission.name), message: escapeHtml(message).replace(/\n/g, "<br>") };
  const sendResult = await sendEmail({
    to: submission.email,
    subject: applyTemplateVars(tpl.subject, vars),
    html: applyTemplateVars(tpl.body_html, vars),
    from: tpl.from_email,
    templateKey: tpl.key,
    category: "fixed",
    trackOpens: tpl.track_opens,
  });

  if (!sendResult.ok) {
    return NextResponse.json({ error: "Failed to send reply email." }, { status: 502 });
  }

  // Full history lives here -- any number of replies, oldest to newest.
  const inserted = await pool.query(
    "INSERT INTO contact_submission_replies (submission_id, admin_email, message) VALUES ($1, $2, $3) RETURNING id, admin_email, message, sent_at",
    [id, adminEmail, message]
  );
  // Kept in sync for the dashboard's "unreplied" count and CSV export, which
  // only need "has this ever been replied to" / the latest reply text.
  await pool.query(
    "UPDATE contact_submissions SET replied_at = now(), reply_text = $1 WHERE id = $2",
    [message, id]
  );

  return NextResponse.json({ ok: true, reply: inserted.rows[0] });
}
