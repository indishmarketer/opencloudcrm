import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { deleteEventType, getEventType, updateEventType } from "@/lib/calcom";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const result = await pool.query("SELECT * FROM meeting_types WHERE id = $1", [id]);
  const row = result.rows[0];
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  // Notice/buffer settings live on Cal.com's side, not duplicated in our DB
  // (avoids drift) -- fetched live when the console opens the edit form.
  let calcom = null;
  try { calcom = await getEventType(row.calcom_event_type_id); } catch (error) { console.error("Failed to fetch Cal.com event type:", error); }
  return NextResponse.json({ type: row, calcom });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const existing = await pool.query("SELECT * FROM meeting_types WHERE id = $1", [id]);
  const row = existing.rows[0];
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (typeof body.active === "boolean" && Object.keys(body).length === 1) {
    await pool.query("UPDATE meeting_types SET active = $2, updated_at = now() WHERE id = $1", [id, body.active]);
    return NextResponse.json({ ok: true });
  }

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 200) : row.name;
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : row.description;
  const duration = Number.isInteger(Number(body.duration_minutes)) && Number(body.duration_minutes) >= 5 && Number(body.duration_minutes) <= 480 ? Number(body.duration_minutes) : row.duration_minutes;
  const minimumBookingNotice = Number.isFinite(Number(body.minimum_booking_notice)) ? Math.max(0, Number(body.minimum_booking_notice)) : undefined;
  const beforeEventBuffer = Number.isFinite(Number(body.before_event_buffer)) ? Math.max(0, Number(body.before_event_buffer)) : undefined;
  const afterEventBuffer = Number.isFinite(Number(body.after_event_buffer)) ? Math.max(0, Number(body.after_event_buffer)) : undefined;

  try {
    await updateEventType(row.calcom_event_type_id, {
      title: name,
      lengthInMinutes: duration,
      description: description || undefined,
      minimumBookingNotice,
      beforeEventBuffer,
      afterEventBuffer,
    });
  } catch (error) {
    console.error("Failed to update Cal.com event type:", error);
    return NextResponse.json({ error: "Could not update the event type." }, { status: 500 });
  }

  await pool.query(
    "UPDATE meeting_types SET name = $2, description = $3, duration_minutes = $4, updated_at = now() WHERE id = $1",
    [id, name, description || null, duration]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const existing = await pool.query("SELECT calcom_event_type_id FROM meeting_types WHERE id = $1", [id]);
  if (!existing.rows[0]) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    await pool.query("DELETE FROM meeting_types WHERE id = $1", [id]);
  } catch {
    // FK is ON DELETE RESTRICT -- this is the expected, safe rejection when
    // bookings still reference this type, not an unexpected failure.
    return NextResponse.json({ error: "This meeting type has existing bookings and can't be deleted. Deactivate it instead." }, { status: 409 });
  }

  try {
    await deleteEventType(existing.rows[0].calcom_event_type_id);
  } catch (error) {
    console.error("Failed to delete Cal.com event type (our own row is already gone):", error);
  }
  return NextResponse.json({ ok: true });
}
