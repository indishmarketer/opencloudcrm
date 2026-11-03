import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createEventType, getAccountUsername } from "@/lib/calcom";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(
    `SELECT id, slug, name, description, duration_minutes, calcom_event_type_id, calcom_username, calcom_event_slug, active, created_at,
       (SELECT count(*)::int FROM meeting_bookings WHERE meeting_type_id = meeting_types.id) AS booking_count
     FROM meeting_types ORDER BY created_at DESC`
  );
  return NextResponse.json({ types: result.rows });
}

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || slug.length > 120) {
    return NextResponse.json({ error: "Slug must be lowercase letters, numbers, and hyphens only." }, { status: 400 });
  }
  const duration = Number(body.duration_minutes);
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    return NextResponse.json({ error: "Duration must be between 5 and 480 minutes." }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : "";
  const minimumBookingNotice = Number.isFinite(Number(body.minimum_booking_notice)) ? Math.max(0, Number(body.minimum_booking_notice)) : undefined;
  const beforeEventBuffer = Number.isFinite(Number(body.before_event_buffer)) ? Math.max(0, Number(body.before_event_buffer)) : undefined;
  const afterEventBuffer = Number.isFinite(Number(body.after_event_buffer)) ? Math.max(0, Number(body.after_event_buffer)) : undefined;

  const existing = await pool.query("SELECT id FROM meeting_types WHERE slug = $1", [slug]);
  if (existing.rows[0]) return NextResponse.json({ error: "That slug is already in use." }, { status: 409 });

  let eventType;
  try {
    eventType = await createEventType({
      title: body.name.trim().slice(0, 200),
      slug,
      lengthInMinutes: duration,
      description: description || undefined,
      minimumBookingNotice,
      beforeEventBuffer,
      afterEventBuffer,
    });
  } catch (error) {
    console.error("Failed to create Cal.com event type:", error);
    return NextResponse.json({ error: "Could not create the event type. It may already exist." }, { status: 502 });
  }

  const username = await getAccountUsername().catch(() => "");
  const result = await pool.query(
    `INSERT INTO meeting_types (slug, name, description, duration_minutes, calcom_event_type_id, calcom_username, calcom_event_slug, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id`,
    [slug, body.name.trim().slice(0, 200), description || null, duration, String(eventType.id), username, eventType.slug]
  );

  return NextResponse.json({ ok: true, id: result.rows[0].id }, { status: 201 });
}
