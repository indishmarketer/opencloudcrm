import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { getAuthorApplicationByToken, getLatestApplicationForUser } from "@/lib/authorApplications";
import { raiseInboxAlert } from "@/lib/systemAlerts";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const session = token ? null : await getSession();
  const application = token
    ? await getAuthorApplicationByToken(token)
    : session ? await getLatestApplicationForUser(session.userId) : null;
  if (!application) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(`author-application-social:${application.id}`, 10, 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  if (application.status !== "accepted") {
    return NextResponse.json({ error: "No accepted application is waiting for social links." }, { status: 400 });
  }

  const { socialLinks } = body;
  if (!socialLinks || typeof socialLinks !== "string" || !socialLinks.trim()) {
    return NextResponse.json({ error: "Add at least one link." }, { status: 400 });
  }

  await pool.query(`UPDATE author_applications SET social_links = $1 WHERE id = $2`, [
    String(socialLinks).slice(0, 1000),
    application.id,
  ]);

  raiseInboxAlert({
    kind: "author_application_progress",
    dedupeKey: `author_application_progress:${application.id}:social`,
    title: "An author applicant added their social links",
    detail: `From ${application.applicant_email}.`,
    link: "/console/blog/applications",
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
