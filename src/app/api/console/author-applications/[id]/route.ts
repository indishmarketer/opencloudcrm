import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/siteMeta";
import { emitWebhookEvent } from "@/lib/webhookEvents";

const ACTIONS = ["approved", "rejected", "request_changes", "accept_draft"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  // "decision" is the original field name the console UI already sends for
  // approve/reject -- "action" covers the two new draft-review actions.
  const action: Action | undefined = body.action || body.decision;
  const note: string | undefined = body.note;
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  if (action === "request_changes" && (!note || !note.trim())) {
    return NextResponse.json({ error: "A note is required when requesting changes." }, { status: 400 });
  }

  const result = await pool.query(
    `SELECT aa.id, u.name, u.email FROM author_applications aa
     JOIN users u ON u.id = aa.user_id WHERE aa.id = $1`,
    [id]
  );
  const application = result.rows[0];
  if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  const submitUrl = `${SITE_URL}/apply-to-write`;
  const vars = { name: escapeHtml(application.name || ""), submit_url: submitUrl };

  if (action === "approved" || action === "rejected") {
    await pool.query("UPDATE author_applications SET status = $1, reviewed_at = now() WHERE id = $2", [action, id]);
    const tpl = await getEmailTemplate(action === "approved" ? "author-application-approved" : "author-application-rejected");
    await sendEmail({
      to: application.email,
      subject: applyTemplateVars(tpl.subject, vars),
      html: applyTemplateVars(tpl.body_html, vars),
      from: tpl.from_email,
      templateKey: tpl.key,
      category: "fixed",
      trackOpens: tpl.track_opens,
    });
    return NextResponse.json({ ok: true, status: action });
  }

  if (action === "request_changes") {
    await pool.query(
      "UPDATE author_applications SET status = 'changes_requested', admin_note = $1, reviewed_at = now() WHERE id = $2",
      [note, id]
    );
    const tpl = await getEmailTemplate("author-application-changes-requested");
    const withNote = { ...vars, note: escapeHtml(note as string).replace(/\n/g, "<br>") };
    await sendEmail({
      to: application.email,
      subject: applyTemplateVars(tpl.subject, withNote),
      html: applyTemplateVars(tpl.body_html, withNote),
      from: tpl.from_email,
      templateKey: tpl.key,
      category: "fixed",
      trackOpens: tpl.track_opens,
    });
    return NextResponse.json({ ok: true, status: "changes_requested" });
  }

  // accept_draft
  await pool.query("UPDATE author_applications SET status = 'accepted', reviewed_at = now() WHERE id = $1", [id]);
  const tpl = await getEmailTemplate("author-application-draft-accepted");
  await sendEmail({
    to: application.email,
    subject: applyTemplateVars(tpl.subject, vars),
    html: applyTemplateVars(tpl.body_html, vars),
    from: tpl.from_email,
    templateKey: tpl.key,
    category: "fixed",
    trackOpens: tpl.track_opens,
  });
  emitWebhookEvent({
    eventType: "author_application.accepted",
    source: "author_applications",
    sourceRecordId: application.id,
    contactEmail: application.email,
    contactName: application.name,
    data: { application_id: application.id },
  }).catch(() => {});
  return NextResponse.json({ ok: true, status: "accepted" });
}
