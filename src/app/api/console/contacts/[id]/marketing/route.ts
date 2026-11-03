import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool, withTransaction } from "@/lib/db";
import { recordContactActivity } from "@/lib/contacts";

/** Owner turns marketing email on or off for one contact. Turning it off
 * only changes marketing_status: it doesn't add a suppression, so course and
 * account emails still reach them. Turning it on also lifts a suppression
 * left by their own unsubscribe (the UI asks the owner to confirm that), but
 * never a bounce or spam complaint. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isInteger(contactId)) return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.subscribed !== "boolean") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const subscribed: boolean = body.subscribed;

  const contact = await pool.query("SELECT email, normalized_email, name, user_id FROM contacts WHERE id = $1", [contactId]);
  const row = contact.rows[0];
  if (!row) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  await withTransaction(async (client) => {
    if (subscribed) {
      await client.query(
        `UPDATE contacts SET marketing_status = 'subscribed',
           deliverability_status = CASE WHEN deliverability_status = 'suppressed' THEN 'ok' ELSE deliverability_status END,
           updated_at = now()
         WHERE id = $1`,
        [contactId],
      );
      await client.query("DELETE FROM email_suppressions WHERE email = $1", [row.normalized_email]);
      await client.query(
        "UPDATE newsletter_subscribers SET unsubscribed_at = NULL WHERE lower(trim(email)) = $1 AND unsubscribed_at IS NOT NULL",
        [row.normalized_email],
      );
    } else {
      await client.query("UPDATE contacts SET marketing_status = 'unsubscribed', updated_at = now() WHERE id = $1", [contactId]);
    }
    if (row.user_id) {
      await client.query("UPDATE users SET updates_opt_in = $2 WHERE id = $1", [row.user_id, subscribed]);
    }
  });

  await recordContactActivity({
    email: row.email,
    activityType: subscribed ? "marketing_turned_on" : "marketing_turned_off",
    source: "console",
    sourceRecordId: `${contactId}:${Date.now()}`,
    metadata: { by: "admin" },
  });

  return NextResponse.json({ ok: true, status: subscribed ? "subscribed" : "unsubscribed" });
}
