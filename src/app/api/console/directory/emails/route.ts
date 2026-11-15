import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { DIRECTORY_EMAILS, getDirectoryEmailContent } from "@/lib/directoryEmails";

/** The tools directory's built-in emails, with the wording in use. */
export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const emails = await Promise.all(DIRECTORY_EMAILS.map(async (email) => {
    const content = await getDirectoryEmailContent(email.key);
    return { key: email.key, label: email.label, when: email.when, vars: email.vars, ...content };
  }));
  return NextResponse.json({ emails });
}
