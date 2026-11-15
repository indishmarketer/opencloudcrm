import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getAdminSessionEmail } from "@/lib/auth";
import { directoryEmailDefault, getDirectoryEmailContent, resetDirectoryEmail, saveDirectoryEmail, sendDirectoryEmail, type DirectoryEmailKey } from "@/lib/directoryEmails";

type Params = { params: Promise<{ key: string }> };

const SAMPLE: Record<string, string> = {
  first_name: "Alex", tool_name: "Sample Tool", website_url: "https://example.com",
  note: "Please add a clearer tagline.\nAnd a product screenshot.", submitter_email: "someone@example.com",
  event_text: "submitted a new tool:",
};

async function knownKey(params: Params["params"]) {
  const { key } = await params;
  return directoryEmailDefault(key) ? (key as DirectoryEmailKey) : null;
}

/** Save new wording. Only subject and body change; when and to whom it
 * sends stays built in. */
export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = await knownKey(params);
  if (!key) return NextResponse.json({ error: "Unknown email." }, { status: 404 });
  const body = await req.json().catch(() => null);
  const subject = typeof body?.subject === "string" ? body.subject.trim().slice(0, 300) : "";
  const html = typeof body?.body === "string" ? body.body.trim().slice(0, 50_000) : "";
  if (!subject || !html) return NextResponse.json({ error: "Add a subject and a message." }, { status: 400 });
  await saveDirectoryEmail(key, subject, html);
  return NextResponse.json({ ok: true, ...(await getDirectoryEmailContent(key)) });
}

/** Reset to the built-in wording. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = await knownKey(params);
  if (!key) return NextResponse.json({ error: "Unknown email." }, { status: 404 });
  await resetDirectoryEmail(key);
  return NextResponse.json({ ok: true, ...(await getDirectoryEmailContent(key)) });
}

/** Send the saved version to the signed-in admin, with sample values. */
export async function POST(_req: NextRequest, { params }: Params) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = await knownKey(params);
  if (!key) return NextResponse.json({ error: "Unknown email." }, { status: 404 });
  const origin = _req.nextUrl.origin;
  const result = await sendDirectoryEmail(key, adminEmail, {
    ...SAMPLE, tool_url: `${origin}/tools`, edit_url: `${origin}/account/tools`, manage_url: `${origin}/account/tools`,
    payment_url: `${origin}/account/tools`, console_url: `${origin}/console/directory`,
  });
  if (!result.ok) return NextResponse.json({ error: "The test email could not be sent." }, { status: 502 });
  return NextResponse.json({ ok: true, sentTo: adminEmail });
}
