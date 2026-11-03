import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rateLimit";

const schema = z.object({
  webinarId: z.number().int().positive(),
  watchSeconds: z.number().int().min(0).max(86400),
  left: z.boolean().optional(),
  completed: z.boolean().optional(),
}).strict();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await consumeRateLimit(`webinar-progress:${session.userId}`, 300, 60 * 60 * 1000))) return NextResponse.json({ error: "Too many updates." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid progress." }, { status: 400 });
  const result = await pool.query(
    `UPDATE webinar_access
     SET watch_seconds = GREATEST(watch_seconds, $3), last_viewed_at = now(),
         left_at = CASE WHEN $4 THEN now() ELSE left_at END,
         completed_at = CASE WHEN $5 THEN COALESCE(completed_at, now()) ELSE completed_at END
     WHERE webinar_id = $1 AND user_id = $2 RETURNING id`,
    [parsed.data.webinarId, session.userId, parsed.data.watchSeconds, Boolean(parsed.data.left), Boolean(parsed.data.completed)],
  );
  if (!result.rowCount) return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
