import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail, getSession } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { sendEmail } from "@/lib/email";
import { cleanTestRecipient } from "@/lib/testRecipient";
import { pool } from "@/lib/db";
import { applyTemplateVars } from "@/lib/emailTemplates";
import { SITE_NAME } from "@/config/brand";
import { SITE_URL, SITE_HOSTNAME } from "@/lib/liveSiteUrl";
import { resolveEmailDomain } from "@/lib/emailSettings";
import { getBusiness } from "@/lib/businessProfile";

/** Sends whatever is CURRENTLY in the editor (not the saved DB row), with
 * {{var}} placeholders left un-substituted -- there's no single "real"
 * value for course_title/first_name/etc across every fixed email, so a
 * test send just shows the raw template as-is. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const adminSessionEmail = await getAdminSessionEmail();
  let toEmail = adminSessionEmail;
  if (!toEmail) {
    const session = await getSession();
    if (!session || !isConsoleOwner(session.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    toEmail = session.email;
  }

  const { key } = await params;
  const { subject, bodyHtml, fromEmail, testTo } = await req.json();
  toEmail = cleanTestRecipient(testTo) || toEmail;
  if (!subject || !bodyHtml) {
    return NextResponse.json({ error: "subject and bodyHtml are required." }, { status: 400 });
  }
  const template = await pool.query("SELECT allowed_vars FROM email_templates WHERE key = $1", [key]);
  if (!template.rows[0]) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  const sampleValues: Record<string, string> = {
    first_name: "Jordan", code: "123456", reset_url: `${SITE_URL}/reset-password`,
    verify_url: SITE_URL, link: `${SITE_URL}/console`,
    login_url: `${SITE_URL}/console`, invited_by: SITE_NAME,
    applicant_email: toEmail, topics: "AI tools and marketing", sample_block: "<p>Sample article attached.</p>",
    name: "Example Contact", email: toEmail, message: "This is example content for a test email.",
    role: "Founder", rating: "5", note: "Could you share one more detail?", method: "UPI",
    reference: "TEST-123", provider: "Test provider", payer_email: toEmail, payment_id: "TEST-123",
    course_title: "Example Course", course_url: `${SITE_URL}/courses`,
    tier_label: "PRO", ref_label: "Reference", payment_ref: "TEST-123", amount: "999", currency: "INR",
  };
  const vars = Object.fromEntries((template.rows[0].allowed_vars || []).map((name: string) => [name, sampleValues[name] || `(example ${name})`]));
  // site_name is always substitutable (see getEmailTemplate), including in
  // a test send of unsaved editor content that bypasses getEmailTemplate.
  const business = await getBusiness();
  vars.site_name = business.brand || SITE_NAME;

  const result = await sendEmail({
    to: toEmail,
    subject: `[TEST] ${applyTemplateVars(String(subject), vars)}`,
    html: applyTemplateVars(String(bodyHtml), vars),
    from: String(fromEmail || `support@${await resolveEmailDomain(SITE_HOSTNAME)}`),
    critical: true,
    templateKey: key,
    category: "fixed",
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
