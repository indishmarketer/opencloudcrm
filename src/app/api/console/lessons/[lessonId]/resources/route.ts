import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getSession } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { pool } from "@/lib/db";

// Resource management is reachable from the lesson page itself, which uses
// the regular user session (im_session), not the separate console admin
// login (im_admin_session) -- so accept either: a real admin session, OR
// the owner's own regular session. Without this, the owner would need to
// be logged into /console separately just to add a PDF link while
// reviewing their own course.
async function canManageResources(): Promise<boolean> {
  if (await getAdminSession()) return true;
  const session = await getSession();
  return !!session && isConsoleOwner(session.email);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  if (!(await canManageResources())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lessonId } = await params;
  const id = Number(lessonId);
  const { label, url } = await req.json();
  if (!Number.isInteger(id) || !label || !url) {
    return NextResponse.json({ error: "label and url are required." }, { status: 400 });
  }

  const result = await pool.query(
    `INSERT INTO lesson_resources (lesson_id, label, url, position)
     VALUES ($1, $2, $3, COALESCE((SELECT MAX(position) + 1 FROM lesson_resources WHERE lesson_id = $1), 0))
     RETURNING id, label, url`,
    [id, String(label).slice(0, 200), String(url).slice(0, 1000)]
  );

  return NextResponse.json({ ok: true, resource: result.rows[0] });
}
