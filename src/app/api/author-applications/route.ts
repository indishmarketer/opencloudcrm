import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { uploadAuthorDocument } from "@/lib/authorApplicationStorage";
import { sendAuthorApplicationEmail } from "@/lib/authorApplicationEmails";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { raiseInboxAlert } from "@/lib/systemAlerts";
import { ensureContact } from "@/lib/contacts";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Could not read the application." }, { status: 400 });

  const name = text(form, "name");
  const email = text(form, "email").toLowerCase();
  const topics = text(form, "topics");
  const sampleUrl = text(form, "sampleUrl");
  const sampleText = text(form, "sampleText");
  const turnstileToken = text(form, "turnstileToken");
  const sampleFile = form.get("sampleFile");
  const hasFile = sampleFile instanceof File && sampleFile.size > 0;

  if (name.length < 2 || name.length > 120) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (topics.length < 30 || topics.length > 3000) {
    return NextResponse.json({ error: "Tell us a little more about what you want to write." }, { status: 400 });
  }
  if (sampleUrl && !isHttpUrl(sampleUrl)) return NextResponse.json({ error: "Enter a valid sample link." }, { status: 400 });
  if (!sampleUrl && !sampleText && !hasFile) {
    return NextResponse.json({ error: "Add a sample link, paste a sample, or upload a document." }, { status: 400 });
  }
  if (sampleText.length > 12000) return NextResponse.json({ error: "Keep the pasted sample under 12,000 characters." }, { status: 400 });

  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return NextResponse.json({ error: "Human verification failed. Please try again." }, { status: 400 });
  }
  const allowedIp = await checkRateLimit(`author-application:ip:${privateRateLimitKey(ip)}`, 5, 24 * 60 * 60 * 1000);
  const allowedEmail = await checkRateLimit(`author-application:email:${privateRateLimitKey(email)}`, 3, 30 * 24 * 60 * 60 * 1000);
  if (!allowedIp || !allowedEmail) return NextResponse.json({ error: "Too many applications. Try again later." }, { status: 429 });

  const existing = await pool.query(
    `SELECT aa.id FROM author_applications aa
     LEFT JOIN users u ON u.id = aa.user_id
     WHERE lower(COALESCE(aa.applicant_email, u.email)) = $1
       AND aa.status IN ('pending', 'approved', 'draft_submitted', 'changes_requested')
     LIMIT 1`,
    [email],
  );
  if (existing.rows[0]) return NextResponse.json({ error: "You already have an active writer application." }, { status: 409 });

  const accessToken = randomUUID();
  let uploaded: Awaited<ReturnType<typeof uploadAuthorDocument>> | null = null;
  if (hasFile) {
    uploaded = await uploadAuthorDocument(sampleFile as File, accessToken, "sample");
    if ("error" in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 400 });
  }

  const result = await pool.query(
    `INSERT INTO author_applications
       (user_id, applicant_name, applicant_email, topics, sample_url, sample_text,
        sample_file_key, sample_file_name, sample_file_type, sample_file_size, access_token)
     VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [name, email, topics, sampleUrl || null, sampleText ? sampleText.slice(0, 12000) : null,
      uploaded && !("error" in uploaded) ? uploaded.key : null,
      uploaded && !("error" in uploaded) ? uploaded.name : null,
      uploaded && !("error" in uploaded) ? uploaded.contentType : null,
      uploaded && !("error" in uploaded) ? uploaded.size : null,
      accessToken],
  );
  const applicationId = result.rows[0].id as number;

  const contactId = await ensureContact({
    email,
    name,
    source: "author",
    sourceDetail: { label: "Write for us", path: "/apply-to-write" },
  });
  await pool.query(
    `INSERT INTO contact_activities (contact_id, activity_type, source, source_record_id, occurred_at)
     VALUES ($1, 'author_application', 'author_applications', $2, now())
     ON CONFLICT DO NOTHING`,
    [contactId, String(applicationId)],
  ).catch((error) => console.error("Author application contact activity failed:", error));

  await sendAuthorApplicationEmail("received", { name, email, accessToken }).catch((error) => {
    console.error("Author application receipt email failed:", error);
  });
  emitWebhookEvent({
    eventType: "author_application.submitted",
    source: "author_applications",
    sourceRecordId: applicationId,
    contactEmail: email,
    contactName: name,
    data: { application_id: applicationId, topics: topics.slice(0, 1000), sample_url: sampleUrl || null, has_file: hasFile },
  }).catch(() => {});
  raiseInboxAlert({ kind: "author_application", dedupeKey: `author_application:${applicationId}`, title: "Someone applied to write for the blog", detail: `From ${email}.`, link: "/console/blog/applications" }).catch(() => {});

  return NextResponse.json({ ok: true, manageUrl: `/apply-to-write?token=${accessToken}` });
}
