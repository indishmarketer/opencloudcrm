import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

/** Requeues one failed/dead delivery for immediate retry by the dispatcher
 * cron -- does not deliver synchronously, so the console shows it back to
 * 'pending' and the result appears on the next cron run (within 5 minutes). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deliveryId = Number(id);
  if (!Number.isInteger(deliveryId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const result = await pool.query(
    `UPDATE webhook_deliveries
     SET status = 'pending', next_attempt_at = now(), claimed_at = NULL
     WHERE id = $1 AND status IN ('failed', 'dead')
     RETURNING id`,
    [deliveryId]
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Delivery not found or not eligible for retry." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
