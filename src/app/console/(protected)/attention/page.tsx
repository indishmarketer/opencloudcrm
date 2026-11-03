import { pool } from "@/lib/db";
import ConsoleResolveAlertButton from "@/components/ConsoleResolveAlertButton";
import ConsoleAlertOpenLink from "@/components/ConsoleAlertOpenLink";
import ConsoleClearResolvedAlerts from "@/components/ConsoleClearResolvedAlerts";

const SEVERITY_LABEL: Record<string, string> = { critical: "Urgent", warning: "Check", info: "New" };

function when(date: Date) {
  return new Date(date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default async function ConsoleAttentionPage() {
  const [open, resolved, retrying] = await Promise.all([
    pool.query(
      `SELECT id, severity, title, detail, link, created_at, viewed_at FROM system_alerts WHERE resolved_at IS NULL
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC`
    ),
    pool.query(
      `SELECT id, title, resolved_at, resolved_by FROM system_alerts WHERE resolved_at IS NOT NULL
       ORDER BY resolved_at DESC LIMIT 10`
    ),
    pool.query(
      `SELECT id, recipient_email, subject, attempts, next_attempt_at, last_error FROM email_outbox
       WHERE status = 'pending' ORDER BY next_attempt_at`
    ),
  ]);

  const unread = open.rows.filter((alert) => !alert.viewed_at).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">
        Needs attention
        {unread > 0 && (
          <span className="ml-3 align-middle rounded-full bg-red-600 px-2.5 py-1 text-sm font-semibold text-white">
            {unread}
          </span>
        )}
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        Everything waiting on you: tools submitted to the directory, new reviews, people applying to
        write, WhatsApp messages, and anything that failed. Opening one marks it seen, which only
        clears the count. It stays on this list until you mark it done.
      </p>

      <div className="mt-8 space-y-3">
        {open.rows.length === 0 && (
          <p className="rounded-2xl border border-line bg-paper p-5 text-sm text-ink-soft">Nothing needs attention right now.</p>
        )}
        {open.rows.map((alert) => (
          <div
            key={alert.id}
            // Unread items get the solid card; seen ones recede, so a long
            // list still reads at a glance as "these are the new ones".
            className={`rounded-2xl border p-5 ${
              alert.viewed_at ? "border-line bg-paper-soft" : "border-ink/25 bg-paper"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider">
                  <span className={alert.severity === "critical" ? "text-red-600" : "text-ink-soft"}>{SEVERITY_LABEL[alert.severity] || alert.severity}</span>
                  <span className="ml-2 font-normal normal-case tracking-normal text-ink-soft">{when(alert.created_at)}</span>
                  <span className="ml-2 font-normal normal-case tracking-normal text-ink-soft">
                    {alert.viewed_at ? "· Seen, not done yet" : "· New"}
                  </span>
                </p>
                <p className="mt-1 font-medium">{alert.title}</p>
                {alert.detail && <p className="mt-1 text-sm text-ink-soft">{alert.detail}</p>}
                {typeof alert.link === "string" && alert.link.startsWith("/") && alert.link !== "/console/attention" && (
                  <ConsoleAlertOpenLink id={Number(alert.id)} href={alert.link} />
                )}
              </div>
              <ConsoleResolveAlertButton id={Number(alert.id)} />
            </div>
          </div>
        ))}
      </div>

      {retrying.rows.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">Emails being retried</h2>
          <p className="mt-1 text-sm text-ink-soft">These failed the first time and are retried automatically. You get an alert if they still fail.</p>
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-paper text-sm">
            {retrying.rows.map((row) => (
              <li key={row.id} className="p-4">
                <p className="font-medium">{row.subject}</p>
                <p className="text-ink-soft">
                  To {row.recipient_email} · try {row.attempts + 1} at {when(row.next_attempt_at)}
                  {row.last_error ? ` · ${row.last_error}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {resolved.rows.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Recently resolved</h2>
            <ConsoleClearResolvedAlerts />
          </div>
          <ul className="mt-4 space-y-2 text-sm text-ink-soft">
            {resolved.rows.map((row) => (
              <li key={row.id}>
                {row.title} · {when(row.resolved_at)}{row.resolved_by ? ` by ${row.resolved_by}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
