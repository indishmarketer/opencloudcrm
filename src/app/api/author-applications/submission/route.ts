import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { deleteAuthorDocument, uploadAuthorDocument } from "@/lib/authorApplicationStorage";
import { getAuthorApplicationByToken, getLatestApplicationForUser } from "@/lib/authorApplications";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { raiseInboxAlert } from "@/lib/systemAlerts";

function value(form: FormData, key: string): string {
  const item = form.get(key);
  return typeof item === "string" ? item.trim() : "";
}

function isHttpUrl(input: string): boolean {
  if (!input) return false;
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Could not read the draft submission." }, { status: 400 });
  const token = value(form, "token");
  const session = token ? null : await getSession();
  const application = token
    ? await getAuthorApplicationByToken(token)
    : session ? await getLatestApplicationForUser(session.userId) : null;
  if (!application || (application.status !== "approved" && application.status !== "changes_requested")) {
    return NextResponse.json({ error: "No application is ready for a draft submission." }, { status: 400 });
  }
  if (!(await checkRateLimit(`author-application-submission:${application.id}`, 10, 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  const submissionUrl = value(form, "submissionUrl");
  const note = value(form, "note");
  const submissionFile = form.get("submissionFile");
  const hasFile = submissionFile instanceof File && submissionFile.size > 0;
  if (submissionUrl && !isHttpUrl(submissionUrl)) return NextResponse.json({ error: "Enter a valid draft link." }, { status: 400 });
  if (!submissionUrl && !hasFile) return NextResponse.json({ error: "Share a draft link or upload a document." }, { status: 400 });
  if (note.length > 2000) return NextResponse.json({ error: "Keep the note under 2,000 characters." }, { status: 400 });

  let uploaded: Awaited<ReturnType<typeof uploadAuthorDocument>> | null = null;
  if (hasFile) {
    const storageToken = application.access_token || `member-${application.user_id || application.id}`;
    uploaded = await uploadAuthorDocument(submissionFile as File, storageToken, "submission");
    if ("error" in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 400 });
  }

  const oldFileKey = application.submission_file_key;
  const wasResubmit = application.status === "changes_requested";
  await pool.query(
    `UPDATE author_applications SET submission_url = $1, submission_note = $2,
       submission_file_key = $3, submission_file_name = $4,
       submission_file_type = $5, submission_file_size = $6,
       status = 'draft_submitted' WHERE id = $7`,
    [submissionUrl || null, note || null,
      uploaded && !("error" in uploaded) ? uploaded.key : null,
      uploaded && !("error" in uploaded) ? uploaded.name : null,
      uploaded && !("error" in uploaded) ? uploaded.contentType : null,
      uploaded && !("error" in uploaded) ? uploaded.size : null,
      application.id],
  );
  if (oldFileKey) await deleteAuthorDocument(oldFileKey);

  raiseInboxAlert({ kind: "author_application_progress", dedupeKey: `author_application_progress:${application.id}:${wasResubmit ? "resubmit" : "submit"}`, title: `An author applicant ${wasResubmit ? "resubmitted" : "submitted"} a draft`, detail: `From ${application.applicant_email}.`, link: "/console/blog/applications" }).catch(() => {});
  emitWebhookEvent({
    eventType: "author_application.draft_submitted",
    source: "author_applications",
    sourceRecordId: application.id,
    contactEmail: application.applicant_email,
    contactName: application.applicant_name,
    userId: application.user_id || undefined,
    data: { application_id: application.id, submission_url: submissionUrl || null, has_file: hasFile },
  }).catch(() => {});
  return NextResponse.json({ ok: true, status: "draft_submitted" });
}
