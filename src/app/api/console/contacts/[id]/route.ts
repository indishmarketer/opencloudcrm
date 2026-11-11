import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { normalizeCountry } from "@/lib/countries";

/** Editing covers the contact's own details: full name, first/last name,
 * phone, country and address. Email is the join key every synced source
 * table (users, newsletter_subscribers, contact_submissions) keys off of via
 * normalized_email/user_id -- changing it here would silently desync those
 * triggers, so it stays out of scope for this endpoint. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isInteger(contactId)) return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const firstName = typeof body.firstName === "string" ? body.firstName.trim().slice(0, 100) : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim().slice(0, 100) : "";
  const address = typeof body.address === "string" ? body.address.trim().slice(0, 500) : "";
  // Country is optional in the body: a code sets it as the owner's choice
  // (it then decides checkout even through a VPN), "" clears it.
  const hasCountry = typeof body.country === "string";
  const country = hasCountry ? normalizeCountry(body.country) : null;
  if (hasCountry && body.country !== "" && !country) {
    return NextResponse.json({ error: "Invalid country" }, { status: 400 });
  }

  const result = await pool.query(
    `UPDATE contacts SET name = $2, phone = $3,
       first_name = $6, last_name = $7, address = $8,
       country = CASE WHEN $4 THEN $5 ELSE country END,
       country_source = CASE WHEN $4 THEN (CASE WHEN $5::text IS NULL THEN NULL ELSE 'owner' END) ELSE country_source END,
       updated_at = now()
     WHERE id = $1 RETURNING id`,
    [contactId, name || null, phone || null, hasCountry, country, firstName || null, lastName || null, address || null],
  );
  if (!result.rowCount) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
