import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getDefaultSchedule, updateSchedule, type CalcomAvailabilitySlot, type CalcomScheduleOverride, type CalcomWeekday } from "@/lib/calcom";

const VALID_DAYS: CalcomWeekday[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const schedule = await getDefaultSchedule();
    return NextResponse.json({ schedule });
  } catch (error) {
    console.error("Failed to fetch Cal.com schedule:", error);
    return NextResponse.json({ error: "Could not load availability." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.timeZone !== "string" || !Array.isArray(body.availability) || !Array.isArray(body.overrides)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const availability: CalcomAvailabilitySlot[] = [];
  for (const slot of body.availability) {
    if (!slot || !Array.isArray(slot.days) || typeof slot.startTime !== "string" || typeof slot.endTime !== "string") {
      return NextResponse.json({ error: "Invalid availability entry." }, { status: 400 });
    }
    const days = slot.days.filter((d: unknown): d is CalcomWeekday => typeof d === "string" && VALID_DAYS.includes(d as CalcomWeekday));
    if (!days.length || !TIME_RE.test(slot.startTime) || !TIME_RE.test(slot.endTime) || slot.startTime >= slot.endTime) {
      return NextResponse.json({ error: "Each time range needs a valid start time before its end time." }, { status: 400 });
    }
    availability.push({ days, startTime: slot.startTime, endTime: slot.endTime });
  }

  const overrides: CalcomScheduleOverride[] = [];
  const seenDates = new Set<string>();
  for (const entry of body.overrides) {
    if (!entry || typeof entry.date !== "string" || typeof entry.startTime !== "string" || typeof entry.endTime !== "string") {
      return NextResponse.json({ error: "Invalid date override entry." }, { status: 400 });
    }
    // Equal start/end represents a fully blocked date (see meetingAvailability.ts) --
    // otherwise a real range, so it must still be ordered.
    if (!DATE_RE.test(entry.date) || !TIME_RE.test(entry.startTime) || !TIME_RE.test(entry.endTime) || entry.startTime > entry.endTime) {
      return NextResponse.json({ error: "Each date override needs a valid date and an ordered start/end time." }, { status: 400 });
    }
    if (seenDates.has(entry.date)) return NextResponse.json({ error: `${entry.date} is listed more than once.` }, { status: 400 });
    seenDates.add(entry.date);
    overrides.push({ date: entry.date, startTime: entry.startTime, endTime: entry.endTime });
  }

  try {
    const current = await getDefaultSchedule();
    const updated = await updateSchedule(current.id, { timeZone: body.timeZone, availability, overrides });
    return NextResponse.json({ ok: true, schedule: updated });
  } catch (error) {
    console.error("Failed to update Cal.com schedule:", error);
    return NextResponse.json({ error: "Could not save availability." }, { status: 500 });
  }
}
