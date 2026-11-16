import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { cleanSourceLabel, MAX_SOURCE_WORDS, sourcePath } from "@/lib/pageSourcesShape";

type Params = { params: Promise<{ id: string }> };

async function contactId(params: Params["params"]) {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function list(id: number) {
  const result = await pool.query<{ label: string; path: string | null }>(
    "SELECT label, path FROM contact_sources WHERE contact_id = $1 ORDER BY created_at, id", [id],
  );
  return result.rows;
}

/** Add a source by hand. Its link is the page that carries that label,
 * unless a page address is given. */
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = await contactId(params);
  if (!id) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  const body = await req.json().catch(() => null);
  const label = cleanSourceLabel(body?.label);
  if (label === null) return NextResponse.json({ error: `Keep the source to ${MAX_SOURCE_WORDS} words or fewer.` }, { status: 400 });
  if (!label) return NextResponse.json({ error: "Write a source." }, { status: 400 });
  const path = typeof body?.path === "string" && body.path.trim() ? sourcePath(body.path.trim()) : null;
  const exists = await pool.query("SELECT 1 FROM contacts WHERE id = $1", [id]);
  if (!exists.rowCount) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  await pool.query(
    `INSERT INTO contact_sources (contact_id, label, path)
     VALUES ($1, $2, COALESCE($3, (SELECT ps.path FROM page_sources ps WHERE lower(ps.label) = lower($2) ORDER BY ps.path LIMIT 1)))
     ON CONFLICT DO NOTHING`,
    [id, label, path],
  );
  return NextResponse.json({ sources: await list(id) });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = await contactId(params);
  if (!id) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  const label = req.nextUrl.searchParams.get("label") || "";
  await pool.query("DELETE FROM contact_sources WHERE contact_id = $1 AND lower(label) = lower($2)", [id, label]);
  return NextResponse.json({ sources: await list(id) });
}
