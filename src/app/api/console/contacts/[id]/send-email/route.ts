import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { SENDER_VALUES } from "@/lib/emailSenders";
import { getReplyToEmail } from "@/lib/businessProfile";
import { contactMessageValues, applyMessageVariables } from "@/lib/messageVariables";
import { parseIndiaDateTime } from "@/lib/indiaTime";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid contact." }, { status: 400 });
  const result = await pool.query(
    `SELECT id, subject, scheduled_at FROM contact_email_scheduled
     WHERE contact_id = $1 AND status = 'pending' AND scheduled_at > now()
     ORDER BY scheduled_at`,
    [Number(id)],
  );
  return NextResponse.json({ scheduledEmails: result.rows });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid contact." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter a subject and message." }, { status: 400 });
  }
  const input = body as { subject?: unknown; html?: unknown; from?: unknown; scheduledAt?: unknown };
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const html = typeof input.html === "string" ? input.html.trim() : "";
  if (!subject || !html) return NextResponse.json({ error: "Enter a subject and message." }, { status: 400 });
  if (subject.length > 200 || html.length > 20000) {
    return NextResponse.json({ error: "Subject must be under 200 characters and message under 20,000." }, { status: 400 });
  }
  const from = typeof input.from === "string" ? input.from.trim().toLowerCase() : SENDER_VALUES[0];
  if (!SENDER_VALUES.includes(from)) {
    return NextResponse.json({ error: "Pick one of the site's own sending addresses." }, { status: 400 });
  }

  const contactResult = await pool.query<{
    email: string;
    name: string | null;
    phone: string | null;
    marketing_status: string;
    deliverability_status: string;
  }>(
    "SELECT email, name, phone, marketing_status, deliverability_status FROM contacts WHERE id = $1",
    [Number(id)],
  );
  const contact = contactResult.rows[0];
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  if (contact.marketing_status === "unsubscribed" || contact.deliverability_status !== "ok") {
    return NextResponse.json({ error: "This contact is unsubscribed, suppressed, or marked undeliverable." }, { status: 409 });
  }

  // {{first_name}}/{{name}}/{{email}}/{{phone}} may have been inserted while
  // writing (by hand, or copied in from a template) -- filled from this
  // exact contact's own data, the same values the editor's insert buttons
  // represent. Unused tokens (e.g. {{course_title}} with no course in
  // context here) resolve to an empty string.
  const values = contactMessageValues(contact);
  const resolvedSubject = applyMessageVariables(subject, values);
  const resolvedHtml = applyMessageVariables(html, values);
  if (input.scheduledAt !== undefined) {
    const scheduledAt = parseIndiaDateTime(input.scheduledAt);
    if (!scheduledAt) return NextResponse.json({ error: "Choose a valid future date and time in IST." }, { status: 400 });
    const replyTo = await getReplyToEmail();
    const queued = await pool.query(
      `INSERT INTO contact_email_scheduled
         (contact_id, recipient_email, from_email, reply_to, subject, html, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [Number(id), contact.email, from, replyTo, resolvedSubject, resolvedHtml, scheduledAt],
    );
    return NextResponse.json({ ok: true, scheduled: true, id: queued.rows[0].id, scheduledAt: scheduledAt.toISOString() });
  }

  const result = await sendEmail({
    to: contact.email,
    subject: resolvedSubject,
    html: resolvedHtml,
    from,
    replyTo: await getReplyToEmail(),
    category: "system",
    trackOpens: false,
  });

  if (result.skipped === "unsubscribed") {
    return NextResponse.json({ error: "This contact is suppressed and cannot receive email." }, { status: 409 });
  }
  if (!result.ok) return NextResponse.json({ error: "Email could not be sent. Check email activity for details." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
