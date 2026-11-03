import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { normalizeContactEmail } from "@/lib/contacts";

type ImportRow = { email: string; name?: string; phone?: string };

const MAX_ROWS = 5000;

/** Bulk import from the "Import contacts" flow -- the client has already
 * parsed the CSV and mapped columns to {email, name, phone}; this just
 * validates and upserts. Same consent rule as manual creation: imported
 * contacts never start 'subscribed', since a CSV of addresses isn't proof
 * of opt-in. */
export async function POST(req: Request) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const rows: unknown = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Import is limited to ${MAX_ROWS} rows at a time` }, { status: 400 });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const cleaned: ImportRow[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  for (const raw of rows as Record<string, unknown>[]) {
    const email = typeof raw.email === "string" ? raw.email.trim() : "";
    if (!email || !emailPattern.test(email)) {
      skipped++;
      continue;
    }
    const normalized = normalizeContactEmail(email);
    if (seen.has(normalized)) {
      skipped++;
      continue;
    }
    seen.add(normalized);
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const phone = typeof raw.phone === "string" ? raw.phone.trim() : "";
    cleaned.push({ email, name: name || undefined, phone: phone || undefined });
  }

  if (cleaned.length === 0) {
    return NextResponse.json({ error: "No valid email addresses found in this file" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  for (const row of cleaned) {
    const normalized = normalizeContactEmail(row.email);
    const result = await pool.query(
      `INSERT INTO contacts (email, normalized_email, name, phone, source, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, 'import', now(), now())
       ON CONFLICT (normalized_email) DO UPDATE SET
         name = COALESCE(contacts.name, EXCLUDED.name),
         phone = COALESCE(contacts.phone, EXCLUDED.phone),
         last_seen_at = now(), updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [row.email, normalized, row.name || null, row.phone || null],
    );
    if (result.rows[0]?.inserted) created++;
    else updated++;
  }

  return NextResponse.json({ ok: true, created, updated, skipped });
}
