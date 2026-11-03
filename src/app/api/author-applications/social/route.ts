import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { getLatestApplicationForUser } from "@/lib/authorApplications";
import { raiseInboxAlert } from "@/lib/systemAlerts";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(`author-application-social:${session.userId}`, 10, 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  const application = await getLatestApplicationForUser(session.userId);
  if (!application || application.status !== "accepted") {
    return NextResponse.json({ error: "No accepted application is waiting for social links." }, { status: 400 });
  }

  const { socialLinks } = await req.json();
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
    detail: `From ${session.email}.`,
    link: "/console/blog/applications",
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
