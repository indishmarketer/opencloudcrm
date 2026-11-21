import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { sendAuthorApplicationEmail } from "@/lib/authorApplicationEmails";
import { deleteAuthorDocument } from "@/lib/authorApplicationStorage";

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
    `SELECT aa.id, aa.user_id, aa.access_token,
            COALESCE(aa.applicant_name, u.name) AS name,
            COALESCE(aa.applicant_email, u.email) AS email
     FROM author_applications aa
     LEFT JOIN users u ON u.id = aa.user_id WHERE aa.id = $1`,
    [id]
  );
  const application = result.rows[0];
  if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  if (action === "approved" || action === "rejected") {
    await pool.query("UPDATE author_applications SET status = $1, reviewed_at = now() WHERE id = $2", [action, id]);
    await sendAuthorApplicationEmail(action, {
      name: application.name,
      email: application.email,
      accessToken: application.access_token,
    });
    emitWebhookEvent({
      eventType: "author_application.reviewed",
      source: "author_applications",
      sourceRecordId: application.id,
      contactEmail: application.email,
      contactName: application.name,
      data: { application_id: application.id, status: action },
    }).catch(() => {});
    return NextResponse.json({ ok: true, status: action });
  }

  if (action === "request_changes") {
    await pool.query(
      "UPDATE author_applications SET status = 'changes_requested', admin_note = $1, reviewed_at = now() WHERE id = $2",
      [note, id]
    );
    await sendAuthorApplicationEmail("changes_requested", {
      name: application.name,
      email: application.email,
      accessToken: application.access_token,
      note,
    });
    emitWebhookEvent({
      eventType: "author_application.reviewed",
      source: "author_applications",
      sourceRecordId: application.id,
      contactEmail: application.email,
      contactName: application.name,
      data: { application_id: application.id, status: "changes_requested", note },
    }).catch(() => {});
    return NextResponse.json({ ok: true, status: "changes_requested" });
  }

  // accept_draft
  await pool.query("UPDATE author_applications SET status = 'accepted', reviewed_at = now() WHERE id = $1", [id]);
  await sendAuthorApplicationEmail("accepted", {
    name: application.name,
    email: application.email,
    accessToken: application.access_token,
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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await pool.query<{
    status: string;
    sample_file_key: string | null;
    submission_file_key: string | null;
  }>(
    `SELECT status, sample_file_key, submission_file_key
     FROM author_applications
     WHERE id = $1`,
    [id],
  );
  const application = result.rows[0];
  if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (application.status !== "rejected") {
    return NextResponse.json({ error: "Reject the application before deleting it permanently." }, { status: 409 });
  }

  try {
    await deleteAuthorDocument(application.sample_file_key, { strict: true });
    await deleteAuthorDocument(application.submission_file_key, { strict: true });
  } catch (error) {
    console.error("Could not delete author application documents:", error);
    return NextResponse.json({ error: "The stored documents could not be deleted. Nothing was removed from the database." }, { status: 502 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM contact_activities
       WHERE source = 'author_applications' AND source_record_id = $1`,
      [String(id)],
    );
    await client.query(
      `DELETE FROM system_alerts
       WHERE dedupe_key = $1 OR dedupe_key LIKE $2`,
      [`author_application:${id}`, `author_application_progress:${id}:%`],
    );
    const deleted = await client.query(
      "DELETE FROM author_applications WHERE id = $1 AND status = 'rejected' RETURNING id",
      [id],
    );
    if (!deleted.rows[0]) throw new Error("Application status changed before deletion.");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Could not delete author application:", error);
    return NextResponse.json({ error: "The application could not be deleted." }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true });
}
