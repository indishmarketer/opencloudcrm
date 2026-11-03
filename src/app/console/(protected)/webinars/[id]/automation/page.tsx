import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import ConsoleWebinarAutomation from "@/components/ConsoleWebinarAutomation";
import ConsoleWebinarTabs from "@/components/ConsoleWebinarTabs";
import { formatWebinarSession } from "@/lib/webinarReminders";

export default async function WebinarAutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const webinarId = Number((await params).id);
  if (!Number.isInteger(webinarId)) notFound();
  const [webinarResult, schedules, events, currentBroadcast] = await Promise.all([
    pool.query("SELECT id, title, duration_seconds FROM webinars WHERE id = $1", [webinarId]),
    pool.query("SELECT * FROM webinar_schedules WHERE webinar_id = $1 ORDER BY schedule_kind, id", [webinarId]),
    pool.query("SELECT * FROM webinar_timed_events WHERE webinar_id = $1 ORDER BY trigger_seconds, id", [webinarId]),
    // Existing registrants stay on the broadcast time they reserved, even
    // after this schedule is edited below -- surface that count here so the
    // owner sees who's affected before changing anything, not after.
    pool.query(
      `SELECT session_start_at, count(*)::int AS total FROM webinar_access
       WHERE webinar_id = $1 AND session_start_at IS NOT NULL
       GROUP BY session_start_at ORDER BY total DESC, session_start_at DESC LIMIT 1`,
      [webinarId],
    ),
  ]);
  const webinar = webinarResult.rows[0];
  if (!webinar) notFound();
  const broadcast = currentBroadcast.rows[0];
  return <div><Link href="/console/webinars" className="text-sm text-ink-soft hover:text-ink">Back to webinars</Link><div className="mt-5"><p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-soft">Automated room</p><h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{webinar.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">Choose when sessions run, then place quizzes and offers at exact points in the recording.</p></div><ConsoleWebinarTabs webinarId={webinarId} active="automation" />{broadcast && <div className="mt-7 rounded-2xl border border-line bg-paper p-5"><p className="text-sm font-semibold">Before you change the schedule below</p><p className="mt-2 text-sm leading-6 text-ink-soft">{broadcast.total} {broadcast.total === 1 ? "person is" : "people are"} currently registered for {formatWebinarSession(broadcast.session_start_at, "Asia/Kolkata")} (IST). Editing the schedule below only changes what <em>new</em> registrants get offered &mdash; it does not move anyone already registered off the time they reserved.</p><Link href={`/console/webinars/${webinarId}/registrations`} className="mt-3 inline-flex text-sm font-medium text-ink underline">See who signed up for which broadcast</Link></div>}<div className="mt-7 rounded-2xl border border-line bg-paper-soft p-5"><p className="text-sm font-semibold">Attendee email timeline</p><p className="mt-2 text-sm leading-6 text-ink-soft">Every reservation sends a confirmation with the attendee&apos;s local session time. Scheduled attendees also receive reminders around 24 hours and 1 hour before their own session, followed by a post-session email. This all follows each attendee&apos;s own reserved time &mdash; editing the schedule here does not retime or resend anything for people already registered; only their own re-registering does that.</p><Link href="/console/email/templates" className="mt-3 inline-flex text-sm font-medium text-ink underline">Edit webinar email templates</Link></div><ConsoleWebinarAutomation webinarId={webinarId} durationSeconds={webinar.duration_seconds} initialSchedules={schedules.rows} initialEvents={events.rows} /></div>;
}
