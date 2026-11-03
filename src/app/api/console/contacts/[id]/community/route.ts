import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { recordContactActivity } from "@/lib/contacts";

/** Gives or takes away PRO community access for one contact.
 *
 * Every account already has the general community; this row is the
 * site-wide PRO membership that `getUserProAccess` checks alongside a PRO
 * course enrolment (src/lib/community.ts). Source 'manual' marks it as
 * something the owner granted rather than something a payment produced, so
 * a future subscription product can tell the two apart.
 *
 * Removing sets 'cancelled' rather than deleting the row: that someone once
 * had access is worth keeping, and a delete would also lose when it
 * started. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isInteger(contactId)) return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.active !== "boolean") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const active: boolean = body.active;

  const contact = await pool.query<{ email: string; name: string | null; user_id: number | null }>(
    "SELECT email, name, user_id FROM contacts WHERE id = $1",
    [contactId],
  );
  const row = contact.rows[0];
  if (!row) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  if (!row.user_id) {
    return NextResponse.json(
      { error: "This contact has no account yet, so there is nothing to give access to. Grant them a course first." },
      { status: 409 },
    );
  }

  if (active) {
    await pool.query(
      `INSERT INTO community_memberships (user_id, status, source)
       VALUES ($1, 'active', 'manual')
       ON CONFLICT (user_id) DO UPDATE SET status = 'active', source = 'manual'`,
      [row.user_id],
    );
  } else {
    await pool.query("UPDATE community_memberships SET status = 'cancelled' WHERE user_id = $1", [row.user_id]);
  }

  await recordContactActivity({
    email: row.email,
    activityType: active ? "community_access_granted" : "community_access_removed",
    source: "console",
    sourceRecordId: `${contactId}:${Date.now()}`,
    metadata: { by: "admin" },
    name: row.name,
    userId: row.user_id,
  }).catch(() => {});

  return NextResponse.json({ ok: true, active });
}
