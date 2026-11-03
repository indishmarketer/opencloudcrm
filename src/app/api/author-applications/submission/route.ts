import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { getLatestApplicationForUser } from "@/lib/authorApplications";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { raiseInboxAlert } from "@/lib/systemAlerts";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(`author-application-submission:${session.userId}`, 10, 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  const application = await getLatestApplicationForUser(session.userId);
  if (!application || (application.status !== "approved" && application.status !== "changes_requested")) {
    return NextResponse.json({ error: "No application is ready for a draft submission." }, { status: 400 });
  }

  const { submissionUrl, note } = await req.json();
  if (!submissionUrl || typeof submissionUrl !== "string" || !isHttpUrl(submissionUrl)) {
    return NextResponse.json({ error: "Enter a valid link (Google Docs, Notion, etc)." }, { status: 400 });
  }

  const wasResubmit = application.status === "changes_requested";
  await pool.query(
    `UPDATE author_applications SET submission_url = $1, submission_note = $2, status = 'draft_submitted' WHERE id = $3`,
    [submissionUrl.slice(0, 500), note ? String(note).slice(0, 2000) : null, application.id]
  );

  raiseInboxAlert({
    kind: "author_application_progress",
    dedupeKey: `author_application_progress:${application.id}:${wasResubmit ? "resubmit" : "submit"}`,
    title: `An author applicant ${wasResubmit ? "resubmitted" : "submitted"} their draft link`,
    detail: `From ${session.email}.`,
    link: "/console/blog/applications",
  }).catch(() => {});

  emitWebhookEvent({
    eventType: "author_application.draft_submitted",
    source: "author_applications",
    sourceRecordId: application.id,
    contactEmail: session.email,
    contactName: application.applicant_name,
    userId: session.userId,
    data: { application_id: application.id, submission_url: submissionUrl },
  }).catch(() => {});

  return NextResponse.json({ ok: true, status: "draft_submitted" });
}
