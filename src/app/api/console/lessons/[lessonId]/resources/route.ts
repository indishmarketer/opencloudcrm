import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getSession } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { pool } from "@/lib/db";
import { normalizeResourceUrl } from "@/lib/courseStudio";

async function canManageResources(): Promise<boolean> {
  if (await getAdminSession()) return true;
  const session = await getSession();
  return !!session && isConsoleOwner(session.email);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  if (!(await canManageResources())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lessonId } = await params;
  const id = Number(lessonId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid lesson." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { label, url, type = "button", content, icon } = body;

  if (type !== "text" && !label?.trim()) {
    return NextResponse.json({ error: "Label is required." }, { status: 400 });
  }
  if (type !== "text" && !url?.trim()) {
    return NextResponse.json({ error: "URL is required for button/link/PDF resources." }, { status: 400 });
  }
  if (type === "text" && !label?.trim() && !content?.trim()) {
    return NextResponse.json({ error: "Label or content is required for text resources." }, { status: 400 });
  }

  const normalizedUrl = url ? normalizeResourceUrl(url) : null;

  const result = await pool.query(
    `INSERT INTO lesson_resources (lesson_id, label, url, type, content, icon, position)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE((SELECT MAX(position) + 1 FROM lesson_resources WHERE lesson_id = $1), 0))
     RETURNING id, lesson_id, label, url, type, content, icon, position`,
    [
      id,
      String(label || "Resource").slice(0, 200),
      normalizedUrl ? String(normalizedUrl).slice(0, 2000) : null,
      type || "button",
      content ? String(content).slice(0, 50000) : null,
      icon ? String(icon).slice(0, 64) : null,
    ]
  );

  return NextResponse.json({ ok: true, resource: result.rows[0] });
}
