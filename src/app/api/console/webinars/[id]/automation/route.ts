import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool, withTransaction } from "@/lib/db";
import { webinarAutomationBodySchema } from "@/lib/webinarAutomationSchema";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const webinarId = Number((await params).id);
  if (!Number.isInteger(webinarId)) return NextResponse.json({ error: "Invalid webinar." }, { status: 400 });
  const [schedules, events] = await Promise.all([
    pool.query("SELECT * FROM webinar_schedules WHERE webinar_id = $1 ORDER BY schedule_kind, id", [webinarId]),
    pool.query("SELECT * FROM webinar_timed_events WHERE webinar_id = $1 ORDER BY trigger_seconds, id", [webinarId]),
  ]);
  return NextResponse.json({ schedules: schedules.rows, events: events.rows }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const webinarId = Number((await params).id);
  if (!Number.isInteger(webinarId)) return NextResponse.json({ error: "Invalid webinar." }, { status: 400 });
  const parsed = webinarAutomationBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid automation settings." }, { status: 400 });
  const exists = await pool.query("SELECT status, duration_seconds FROM webinars WHERE id = $1", [webinarId]);
  if (!exists.rowCount) return NextResponse.json({ error: "Webinar not found." }, { status: 404 });
  if (!exists.rows[0].duration_seconds && parsed.data.schedules.length) return NextResponse.json({ error: "Upload and process the webinar video before scheduling it." }, { status: 409 });
  if (exists.rows[0].status === "published" && !parsed.data.schedules.some((item) => item.active)) return NextResponse.json({ error: "A published webinar must keep at least one active broadcast schedule." }, { status: 409 });
  if (parsed.data.events.some((item) => item.active && item.trigger_seconds >= Number(exists.rows[0].duration_seconds || 0))) return NextResponse.json({ error: "An interaction cannot appear at or after the recording ends." }, { status: 400 });

  const saved = await withTransaction(async (client) => {
    const scheduleIds: number[] = [];
    for (const schedule of parsed.data.schedules) {
      const weekdays = schedule.schedule_kind === "weekly" ? [...new Set(schedule.weekdays)].sort() : [];
      const specificDate = schedule.schedule_kind === "specific" ? schedule.specific_date : null;
      const values = [webinarId, schedule.schedule_kind, schedule.timezone, weekdays, specificDate, schedule.local_time, schedule.active];
      const result = schedule.id
        ? await client.query(`UPDATE webinar_schedules SET schedule_kind=$2, timezone=$3, weekdays=$4::smallint[], specific_date=$5, local_time=$6, active=$7, updated_at=now() WHERE id=$8 AND webinar_id=$1 RETURNING id`, [...values, schedule.id])
        : await client.query(`INSERT INTO webinar_schedules (webinar_id,schedule_kind,timezone,weekdays,specific_date,local_time,active) VALUES ($1,$2,$3,$4::smallint[],$5,$6,$7) RETURNING id`, values);
      if (!result.rowCount) throw new Error("A schedule could not be updated.");
      scheduleIds.push(Number(result.rows[0].id));
    }
    await client.query("DELETE FROM webinar_schedules WHERE webinar_id = $1 AND NOT (id = ANY($2::bigint[]))", [webinarId, scheduleIds]);

    const eventIds: number[] = [];
    for (const event of parsed.data.events) {
      const usesOptions = event.event_type === "quiz" || (event.event_type === "question" && event.response_type === "choice");
      const options = usesOptions ? event.options : [];
      const correct = event.event_type === "quiz" ? event.correct_option : null;
      const ctaLabel = event.event_type === "cta" ? event.cta_label : null;
      const ctaUrl = event.event_type === "cta" ? event.cta_url : null;
      const responseType = event.event_type === "question" ? event.response_type : null;
      const values = [webinarId, event.event_type, event.trigger_seconds, event.title, event.body || null, JSON.stringify(options), correct, ctaLabel, ctaUrl, responseType, event.display_mode, event.active];
      const result = event.id
        ? await client.query(`UPDATE webinar_timed_events SET event_type=$2, trigger_seconds=$3, title=$4, body=$5, options=$6::jsonb, correct_option=$7, cta_label=$8, cta_url=$9, response_type=$10, display_mode=$11, active=$12, updated_at=now() WHERE id=$13 AND webinar_id=$1 RETURNING id`, [...values, event.id])
        : await client.query(`INSERT INTO webinar_timed_events (webinar_id,event_type,trigger_seconds,title,body,options,correct_option,cta_label,cta_url,response_type,display_mode,active) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12) RETURNING id`, values);
      if (!result.rowCount) throw new Error("An interaction could not be updated.");
      eventIds.push(Number(result.rows[0].id));
    }
    await client.query("DELETE FROM webinar_timed_events WHERE webinar_id = $1 AND NOT (id = ANY($2::bigint[]))", [webinarId, eventIds]);
    return Promise.all([
      client.query("SELECT * FROM webinar_schedules WHERE webinar_id = $1 ORDER BY schedule_kind, id", [webinarId]),
      client.query("SELECT * FROM webinar_timed_events WHERE webinar_id = $1 ORDER BY trigger_seconds, id", [webinarId]),
    ]);
  });
  return NextResponse.json({ ok: true, schedules: saved[0].rows, events: saved[1].rows });
}
