import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import ConsoleWebinarTabs from "@/components/ConsoleWebinarTabs";

function timestamp(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Every quiz/question answer, grouped by the interaction that asked it and
 * showing exactly which attendee said what -- the whole point of recording
 * these per-attendee in the first place is being able to look someone up
 * and follow up individually, not just count responses. */
export default async function WebinarResponsesPage({ params }: { params: Promise<{ id: string }> }) {
  const webinarId = Number((await params).id);
  if (!Number.isInteger(webinarId)) notFound();

  const [webinarResult, eventsResult, responsesResult] = await Promise.all([
    pool.query("SELECT id, title FROM webinars WHERE id = $1", [webinarId]),
    pool.query(
      `SELECT id, event_type, title, trigger_seconds, options, correct_option, response_type
       FROM webinar_timed_events
       WHERE webinar_id = $1 AND event_type IN ('quiz', 'question')
       ORDER BY trigger_seconds, id`,
      [webinarId],
    ),
    pool.query(
      `SELECT r.event_id, r.selected_option, r.response_text, r.is_correct, r.answered_at,
              COALESCE(c.name, u.name) AS attendee_name, COALESCE(c.email, u.email) AS attendee_email
       FROM webinar_event_responses r
       JOIN webinar_timed_events e ON e.id = r.event_id
       JOIN users u ON u.id = r.user_id
       LEFT JOIN webinar_access wa ON wa.webinar_id = e.webinar_id AND wa.user_id = r.user_id
       LEFT JOIN contacts c ON c.id = wa.contact_id
       WHERE e.webinar_id = $1
       ORDER BY r.answered_at ASC`,
      [webinarId],
    ),
  ]);
  const webinar = webinarResult.rows[0];
  if (!webinar) notFound();

  const responsesByEvent = responsesResult.rows.reduce<Record<number, typeof responsesResult.rows>>((groups, row) => {
    (groups[row.event_id] ||= []).push(row);
    return groups;
  }, {});

  return (
    <div>
      <Link href="/console/webinars" className="text-sm text-ink-soft hover:text-ink">Back to webinars</Link>
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-soft">Attendee management</p>
        <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{webinar.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">Every answer, tied to the exact attendee who gave it, so you can follow up individually.</p>
      </div>
      <ConsoleWebinarTabs webinarId={webinarId} active="responses" />

      <div className="mt-8 space-y-8">
        {eventsResult.rows.map((event) => {
          const responses = responsesByEvent[event.id] || [];
          return (
            <section key={event.id} className="rounded-2xl border border-line bg-paper p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${event.event_type === "quiz" ? "bg-paper-soft text-ink" : "bg-ink text-paper"}`}>
                  {event.event_type === "quiz" ? "Quiz" : event.response_type === "text" ? "Question (free text)" : "Question (multiple choice)"}
                </span>
                <span className="text-xs text-ink-soft">at {timestamp(event.trigger_seconds)}</span>
                <span className="text-xs text-ink-soft">&middot; {responses.length} response{responses.length === 1 ? "" : "s"}</span>
              </div>
              <h2 className="mt-2 font-display text-xl font-semibold">{event.title}</h2>

              {!responses.length ? (
                <p className="mt-4 text-sm text-ink-soft">No one has answered this yet.</p>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="border-b border-line bg-paper-soft text-ink-soft">
                      <tr>
                        <th className="px-4 py-2 font-medium">Attendee</th>
                        <th className="px-4 py-2 font-medium">Answer</th>
                        {event.event_type === "quiz" && event.correct_option !== null && <th className="px-4 py-2 font-medium">Correct?</th>}
                        <th className="px-4 py-2 font-medium">Answered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {responses.map((row, index) => {
                        const options: string[] = Array.isArray(event.options) ? event.options : [];
                        const answerText = row.response_text ?? (row.selected_option !== null ? options[row.selected_option] || `Option ${row.selected_option + 1}` : "");
                        return (
                          <tr key={index}>
                            <td className="px-4 py-3">
                              <p className="font-medium">{row.attendee_name || "Unknown attendee"}</p>
                              <p className="mt-0.5 text-xs text-ink-soft">{row.attendee_email || "No email"}</p>
                            </td>
                            <td className="max-w-xs px-4 py-3">{answerText}</td>
                            {event.event_type === "quiz" && event.correct_option !== null && (
                              <td className="px-4 py-3">{row.is_correct === null ? "-" : row.is_correct ? "Yes" : "No"}</td>
                            )}
                            <td className="px-4 py-3 text-ink-soft">{new Date(row.answered_at).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
        {!eventsResult.rows.length && (
          <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
            No quizzes or questions have been added to this webinar yet. Add one from the Schedule and interactions tab.
          </p>
        )}
      </div>
    </div>
  );
}
