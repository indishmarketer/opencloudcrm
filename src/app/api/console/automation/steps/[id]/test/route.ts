import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail, getSession } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { cleanTestRecipient } from "@/lib/testRecipient";
import { applyVars, firstNameOf } from "@/lib/emailAutomation";
import { SITE_URL, emailAt } from "@/config/brand";

/** Sends whatever is CURRENTLY in the editor (not the saved DB row) as a
 * real test email to the admin's own address, so a draft can be checked
 * before saving. Uses the flow's REAL selected course for
 * course_title/course_url (not a fake placeholder) -- the whole point of
 * a test send is proving the real mapping works, so faking that part
 * would defeat the purpose. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Always send to whichever real address is actually logged in -- never a
  // static ADMIN_EMAIL env var, which may be a reply-to-only address with
  // no real inbox behind it (that was the actual bug: test sends were
  // silently landing somewhere nobody checks, not failing to send).
  const adminSessionEmail = await getAdminSessionEmail();
  let toEmail = adminSessionEmail;
  if (!toEmail) {
    const session = await getSession();
    if (!session || !isConsoleOwner(session.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    toEmail = session.email;
  }

  const { id } = await params;
  const { subject, bodyHtml, fromEmail, testTo } = await req.json();
  toEmail = cleanTestRecipient(testTo) || toEmail;
  if (!subject || !bodyHtml) {
    return NextResponse.json({ error: "subject and bodyHtml are required." }, { status: 400 });
  }

  const context = await pool.query(
    `SELECT c.title AS course_title, c.slug AS course_slug
     FROM email_flow_steps st
     JOIN email_flows f ON f.id = st.flow_id
     LEFT JOIN courses c ON c.id = f.course_id
     WHERE st.id = $1`,
    [Number(id)]
  );
  const row = context.rows[0];

  const recipientRow = await pool.query("SELECT name, email, phone FROM contacts WHERE normalized_email = lower(trim($1)) LIMIT 1", [toEmail]);
  const recipientName = recipientRow.rows[0]?.name || "there";

  const vars = {
    first_name: firstNameOf(recipientName),
    name: recipientName,
    email: toEmail,
    phone: recipientRow.rows[0]?.phone || "",
    ...(row?.course_title
      ? {
          course_title: row.course_title,
          course_url: `${SITE_URL}/courses/${row.course_slug}`,
          completed_lessons: "2",
          total_lessons: "10",
          current_module: "Module 2: Advanced Techniques",
          current_lesson: "Lesson 3: Scaling Up",
        }
      : {
          // This flow's trigger has no course context (e.g. signup/newsletter) --
          // {{course_title}}/{{course_url}} shouldn't appear in its copy at all,
          // but fall back to something obviously-fake rather than leaving the
          // raw "{{course_title}}" text in a sent test email if it's there by mistake.
          course_title: "(no course — this trigger has none)",
          course_url: "${SITE_URL}",
          completed_lessons: "0",
          total_lessons: "0",
          current_module: "",
          current_lesson: "",
        }),
  };

  const result = await sendEmail({
    to: toEmail,
    subject: `[TEST] ${applyVars(subject, vars)}`,
    html: applyVars(bodyHtml, vars),
    from: String(fromEmail || emailAt("academy")),
    critical: true,
    category: "automation",
    flowStepId: Number(id),
    trackOpens: false,
    trackClicks: false,
    isTest: true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "The email API rejected this send — check the server logs for the real reason." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, sentTo: toEmail });
}
