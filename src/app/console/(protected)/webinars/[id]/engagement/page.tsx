import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import ConsoleWebinarEngagement from "@/components/ConsoleWebinarEngagement";
import ConsoleWebinarTabs from "@/components/ConsoleWebinarTabs";

export default async function WebinarEngagementPage({ params }: { params: Promise<{ id: string }> }) {
  const webinarId = Number((await params).id);
  if (!Number.isInteger(webinarId)) notFound();

  const [webinarResult, messagesResult] = await Promise.all([
    pool.query("SELECT id, title, slug FROM webinars WHERE id = $1", [webinarId]),
    pool.query(
      `SELECT wc.id, wc.body, wc.is_question, wc.status, wc.parent_comment_id, wc.created_at, wc.session_start_at,
              u.name AS attendee_name, u.email AS attendee_email
       FROM webinar_comments wc
       JOIN users u ON u.id = wc.user_id
       WHERE wc.webinar_id = $1 AND (wc.is_question = true OR wc.parent_comment_id IS NOT NULL)
       ORDER BY wc.session_start_at DESC NULLS LAST, wc.created_at ASC`,
      [webinarId],
    ),
  ]);
  const webinar = webinarResult.rows[0];
  if (!webinar) notFound();

  return (
    <div>
      <Link href="/console/webinars" className="text-sm text-ink-soft hover:text-ink">Back to webinars</Link>
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-soft">Room engagement</p>
        <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{webinar.title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">Review questions in the exact broadcast where they were asked. Simulated-live webinars do not have attendee-to-attendee chat.</p>
      </div>
      <ConsoleWebinarTabs webinarId={webinarId} active="engagement" />
      <ConsoleWebinarEngagement webinarId={webinarId} initialMessages={messagesResult.rows} />
    </div>
  );
}
