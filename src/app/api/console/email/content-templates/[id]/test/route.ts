import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail, getSession } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { sendEmail } from "@/lib/email";
import { cleanTestRecipient } from "@/lib/testRecipient";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { getBusiness } from "@/lib/businessProfile";
import { SITE_NAME } from "@/config/brand";

/** Mirrors workflows.ts's own valueAtPath/interpolate exactly (not
 * exported there) -- a content template can use dotted {{data.xxx}} event
 * fields (see EMAIL_ATTRIBUTES in messageVariables.ts), which the flat
 * {{token}}-only helpers (applyMessageVariables, applyTemplateVars) can't
 * resolve at all: their regex excludes "." from the token body. */
function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object") return (current as Record<string, unknown>)[key];
    return undefined;
  }, value);
}
function interpolate(text: string, payload: unknown, escapeValues = false): string {
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, key: string) => {
    const found = valueAtPath(payload, key.trim());
    const replacement = found === null || found === undefined ? "" : typeof found === "string" ? found : JSON.stringify(found);
    return escapeValues ? escapeHtml(replacement) : replacement;
  });
}

/** Sends whatever is CURRENTLY in the editor (not the saved DB row). A
 * content template has no single real recipient or workflow event -- it
 * can be dropped into any automation step later -- so every {{token}} this
 * app offers (EMAIL_ATTRIBUTES) gets a representative example value from a
 * fake event payload shaped the same way a real one would be. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const business = await getBusiness();
  const payload = {
    first_name: "Jordan", last_name: "Rivera", name: "Jordan Rivera", email: toEmail,
    phone: "+1 555 0100", country: "United States", address: "123 Example Street", source: "signup",
    contact: { id: 1001, email: toEmail },
    event_type: "course.enrolled",
    course_title: "Example Course", course_url: `${SITE_URL}/courses`,
    site_name: business.brand || SITE_NAME,
    data: {
      course_id: 101, course_title: "Example Course", course_url: `${SITE_URL}/courses`,
      course_slug: "example-course", tier: "PRO", completed_lessons: 4, total_lessons: 10,
      current_module: "Module 2", current_lesson: "Lesson 3",
      tool_id: 501, tool_name: "Example Tool", website_url: "https://example.com",
      tool_url: `${SITE_URL}/tools/example-tool`, edit_url: `${SITE_URL}/console`,
      manage_url: `${SITE_URL}/console`, payment_url: `${SITE_URL}/console`,
      pricing_type: "Free", status: "Approved", note: "Looks great.",
      amount: "999", currency: "INR", method: "UPI", payment_id: "TEST-123",
      order_id: "TEST-123", failure_code: "",
      scheduled_start: "Tomorrow, 4:00 PM", timezone: "Asia/Kolkata",
      join_link: SITE_URL, booking_page: SITE_URL, meeting_name: "Example Meeting",
      guide: "example-guide", guide_url: SITE_URL, application_id: "TEST-123",
      topics: "AI tools and marketing", message: "This is example content for a test email.",
      sample_url: SITE_URL, submission_url: SITE_URL,
      form_id: 1, form_name: "Example Form", submission_id: 1001, page_url: SITE_URL,
      code: "123456", verification_url: SITE_URL, magic_link_url: SITE_URL,
      expires_minutes: 10, verify_url: SITE_URL, reset_url: `${SITE_URL}/reset-password`,
      confirm_url: SITE_URL, current_email: toEmail, login_url: `${SITE_URL}/console`,
      signin_url: `${SITE_URL}/console`, link: `${SITE_URL}/console`,
      invited_by: business.brand || SITE_NAME, source: "signup",
    },
  };

  const result = await sendEmail({
    to: toEmail,
    subject: `[TEST] ${interpolate(String(subject), payload)}`,
    // Escaped, matching the real send path (workflows.ts's email action
    // escapes body substitutions so a form value can't inject markup).
    html: interpolate(String(bodyHtml), payload, true),
    from: String(fromEmail || `support@${SITE_URL.replace(/^https?:\/\//, "")}`),
    critical: true,
    templateKey: `content-template:${id}`,
    category: "automation",
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
