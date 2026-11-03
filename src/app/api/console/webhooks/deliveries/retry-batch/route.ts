import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

const MAX_BATCH = 50;

/** Bounded batch retry -- requeues up to MAX_BATCH eligible failed/dead
 * deliveries at once (optionally scoped to one destination), so a receiver
 * that was down for a while can be recovered without clicking retry
 * individually on every row, but without ever unbounded-retrying an entire
 * table in one request. */
export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const destinationId = Number.isInteger(body?.destination_id) ? body.destination_id : null;

  const result = await pool.query(
    `WITH eligible AS (
       SELECT id FROM webhook_deliveries
       WHERE status IN ('failed', 'dead') AND ($1::int IS NULL OR destination_id = $1)
       ORDER BY id DESC
       LIMIT $2
     )
     UPDATE webhook_deliveries wd
     SET status = 'pending', next_attempt_at = now(), claimed_at = NULL
     FROM eligible WHERE wd.id = eligible.id
     RETURNING wd.id`,
    [destinationId, MAX_BATCH]
  );

  return NextResponse.json({ ok: true, requeued: result.rowCount });
}
