import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rateLimit";
import { canCommentOnWebinar } from "@/lib/webinars";
import { isConsoleOwner } from "@/lib/consoleAdmins";

const schema = z.object({
  selectedOption: z.number().int().min(0).max(20).optional(),
  responseText: z.string().trim().min(1).max(2000).optional(),
}).strict().refine((v) => v.selectedOption !== undefined || v.responseText !== undefined, { message: "An answer is required." });

/** Handles both scored quizzes and the unscored "question" interaction type
 * (multiple choice or free text) -- every answer is recorded per attendee
 * per webinar in webinar_event_responses so it can be reviewed later in
 * console, not just accepted and discarded. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const eventId = Number((await params).eventId);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(eventId) || !parsed.success) return NextResponse.json({ error: "Invalid answer." }, { status: 400 });
  if (!(await consumeRateLimit(`webinar-quiz:${session.userId}`, 60, 60 * 60 * 1000))) return NextResponse.json({ error: "Too many attempts." }, { status: 429 });

  const eventResult = await pool.query(
    "SELECT webinar_id, event_type, options, correct_option, response_type FROM webinar_timed_events WHERE id = $1 AND event_type IN ('quiz', 'question') AND active = true",
    [eventId],
  );
  const event = eventResult.rows[0];
  if (!event) return NextResponse.json({ error: "Interaction not found." }, { status: 404 });
  if (!isConsoleOwner(session.email) && !(await canCommentOnWebinar(session.userId, Number(event.webinar_id)))) return NextResponse.json({ error: "You do not have access to this webinar." }, { status: 403 });

  let selectedOption: number | null = null;
  let responseText: string | null = null;
  let isCorrect: boolean | null = null;

  const usesOptions = event.event_type === "quiz" || event.response_type === "choice";
  if (usesOptions) {
    if (parsed.data.selectedOption === undefined || !Array.isArray(event.options) || parsed.data.selectedOption >= event.options.length) {
      return NextResponse.json({ error: "Invalid answer." }, { status: 400 });
    }
    selectedOption = parsed.data.selectedOption;
    isCorrect = event.correct_option === null ? null : selectedOption === Number(event.correct_option);
  } else {
    if (parsed.data.responseText === undefined) return NextResponse.json({ error: "Invalid answer." }, { status: 400 });
    responseText = parsed.data.responseText;
  }

  await pool.query(
    `INSERT INTO webinar_event_responses (event_id, user_id, selected_option, response_text, is_correct)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (event_id,user_id) DO UPDATE SET selected_option=EXCLUDED.selected_option, response_text=EXCLUDED.response_text, is_correct=EXCLUDED.is_correct, answered_at=now()`,
    [eventId, session.userId, selectedOption, responseText, isCorrect],
  );
  return NextResponse.json({ ok: true, isCorrect });
}
