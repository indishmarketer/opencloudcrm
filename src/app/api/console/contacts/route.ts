import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { normalizeContactEmail, recordContactActivity } from "@/lib/contacts";

/** Manual single-contact creation from the console (the "Create contact"
 * action). The owner adds people they already know, so marketing email is
 * on by default; the form has a box to leave it off. Either way it's logged
 * on the contact's timeline as an admin choice. */
export async function POST(req: Request) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const marketing = body.marketing !== false;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const normalized = normalizeContactEmail(email);
  const existing = await pool.query("SELECT id FROM contacts WHERE normalized_email = $1", [normalized]);
  if (existing.rowCount) {
    return NextResponse.json({ error: "A contact with this email already exists" }, { status: 409 });
  }

  const inserted = await pool.query(
    `INSERT INTO contacts (email, normalized_email, name, phone, source, first_seen_at, last_seen_at, marketing_status)
     VALUES ($1, $2, $3, $4, 'manual', now(), now(), $5)
     RETURNING id`,
    [email, normalized, name || null, phone || null, marketing ? "subscribed" : "unknown"],
  );
  const id = Number(inserted.rows[0].id);

  if (marketing) {
    await recordContactActivity({
      email: normalized,
      activityType: "marketing_turned_on",
      source: "console",
      sourceRecordId: `${id}:create`,
      metadata: { by: "admin" },
    });
  }

  return NextResponse.json({ ok: true, id });
}
