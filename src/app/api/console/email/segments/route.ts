import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { countSegmentContacts } from "@/lib/contactSegments";
import { validateSegmentRules } from "@/lib/contactSegmentTypes";

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as { name?: unknown; description?: unknown; rules?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 200) : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 1000) : "";
  if (!name) return NextResponse.json({ error: "Segment name is required." }, { status: 400 });
  const validation = validateSegmentRules(body?.rules);
  if (validation.error) return NextResponse.json({ error: validation.error }, { status: 400 });
  const rules = validation.rules;

  const result = await pool.query(
    `INSERT INTO contact_segments (name, description, rules)
     VALUES ($1, $2, $3) RETURNING id`,
    [name, description || null, JSON.stringify(rules)],
  );
  return NextResponse.json({ id: result.rows[0].id });
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as { rules?: unknown } | null;
  const validation = validateSegmentRules(body?.rules);
  if (validation.error) return NextResponse.json({ error: validation.error }, { status: 400 });
  const rules = validation.rules;
  const count = await countSegmentContacts(rules, true);
  return NextResponse.json({ count });
}
