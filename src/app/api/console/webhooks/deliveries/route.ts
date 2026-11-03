import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const destinationId = searchParams.get("destination_id");
  const eventType = searchParams.get("event_type");
  const status = searchParams.get("status");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (destinationId && Number.isInteger(Number(destinationId))) {
    conditions.push(`wd.destination_id = $${i++}`);
    values.push(Number(destinationId));
  }
  if (eventType) {
    conditions.push(`e.event_type = $${i++}`);
    values.push(eventType);
  }
  if (status && ["pending", "processing", "delivered", "failed", "dead"].includes(status)) {
    conditions.push(`wd.status = $${i++}`);
    values.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const offset = (page - 1) * PAGE_SIZE;
  const result = await pool.query(
    `SELECT
       wd.id, wd.destination_id, d.name AS destination_name,
       wd.status, wd.attempt_count, wd.next_attempt_at,
       wd.last_http_status, wd.last_response_excerpt, wd.last_error,
       wd.created_at, wd.last_attempted_at, wd.delivered_at,
       e.event_uuid, e.event_type, e.occurred_at, e.payload, e.is_test
     FROM webhook_deliveries wd
     JOIN webhook_destinations d ON d.id = wd.destination_id
     JOIN webhook_outbox_events e ON e.id = wd.event_id
     ${where}
     ORDER BY wd.id DESC
     LIMIT ${PAGE_SIZE} OFFSET $${i}`,
    [...values, offset]
  );

  const countResult = await pool.query(
    `SELECT count(*)::int AS total
     FROM webhook_deliveries wd JOIN webhook_outbox_events e ON e.id = wd.event_id
     ${where}`,
    values
  );

  return NextResponse.json({
    deliveries: result.rows,
    total: countResult.rows[0]?.total ?? 0,
    page,
    pageSize: PAGE_SIZE,
  });
}
