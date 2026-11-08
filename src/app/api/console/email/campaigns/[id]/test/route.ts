import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail, getSession } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { sendEmail } from "@/lib/email";
import { cleanTestRecipient } from "@/lib/testRecipient";
import { applyMessageVariables, contactMessageValues } from "@/lib/messageVariables";
import { emailAt } from "@/lib/liveSiteUrl";

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
  const { subject, html, fromEmail, testTo } = await req.json();
  toEmail = cleanTestRecipient(testTo) || toEmail;
  if (!subject || !html) {
    return NextResponse.json({ error: "subject and html are required." }, { status: 400 });
  }

  const result = await sendEmail({
    to: toEmail,
    subject: `[TEST] ${applyMessageVariables(subject, contactMessageValues({ name: "there", email: toEmail }))}`,
    html: applyMessageVariables(html, contactMessageValues({ name: "there", email: toEmail })),
    from: String(fromEmail || emailAt("reach")),
    critical: true,
    templateKey: `campaign:${id}`,
    category: "campaign",
    trackOpens: false,
    trackClicks: false,
    campaignId: Number(id),
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
