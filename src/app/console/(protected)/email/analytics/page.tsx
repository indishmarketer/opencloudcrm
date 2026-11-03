import Link from "next/link";
import { pool } from "@/lib/db";
import EmailAnalyticsFilters from "@/components/EmailAnalyticsFilters";
import { EmailDailyChart, OpensByHourChart } from "@/components/EmailAnalyticsCharts";
import {
  ANALYTICS_TYPES,
  RANGE_PRESETS,
  getAudience,
  getBreakdowns,
  getDaily,
  getEngagementDetail,
  getMetrics,
  resolveWindow,
  todayInIndia,
  type BreakdownRow,
  type Metrics,
} from "@/lib/emailAnalytics";

const CATEGORY_LABELS: Record<string, string> = {
  fixed: "Transactional",
  automation: "Automation",
  campaign: "Campaigns",
  system: "System",
  review_request: "Review requests",
};

const PROBLEM_LABELS: Record<string, string> = {
  hard_bounce: "Hard bounce",
  soft_bounce: "Soft bounce",
  spam: "Marked as spam",
  unsubscribed: "Unsubscribed",
};

function pct(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

function fmtPct(value: number | null, digits = 1): string {
  if (value === null) return "–";
  return `${value.toFixed(value >= 10 || value === 0 ? 0 : digits)}%`;
}

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** The rates every ESP reports. Opens only count emails that carry the
 * tracking pixel; clicks count every email. */
function rates(m: Metrics) {
  return {
    delivery: pct(m.delivered, m.sent),
    open: pct(m.opened, m.tracked),
    click: pct(m.clicked, m.delivered),
    clickToOpen: pct(m.clicked, m.opened),
    bounce: pct(m.bounced, m.sent),
    unsubscribe: pct(m.unsubscribed, m.delivered),
    complaint: pct(m.complained, m.delivered),
  };
}

function Delta({ now, before, lowerIsBetter = false }: { now: number | null; before: number | null; lowerIsBetter?: boolean }) {
  if (now === null || before === null) return <span className="text-xs text-ink-soft">no earlier data</span>;
  const diff = now - before;
  if (Math.abs(diff) < 0.05) return <span className="text-xs text-ink-soft">same as before</span>;
  const worse = lowerIsBetter ? diff > 0 : diff < 0;
  return (
    <span className={`text-xs ${worse ? "text-red-600" : "text-ink-soft"}`}>
      {diff > 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(1)} pts vs previous period
    </span>
  );
}

function Kpi({ value, label, detail, delta }: { value: string; label: string; detail?: string; delta?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <p className="text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      {detail && <p className="mt-0.5 text-xs text-ink-soft">{detail}</p>}
      {delta && <p className="mt-2">{delta}</p>}
    </div>
  );
}

function BreakdownTable({ rows, nameHeader, empty, hrefFor }: {
  rows: BreakdownRow[];
  nameHeader: string;
  empty: string;
  hrefFor?: (row: BreakdownRow) => string | null;
}) {
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-paper">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-ink-soft">
          <tr>
            <th className="px-4 py-3 font-medium">{nameHeader}</th>
            <th className="px-4 py-3 font-medium">Sent</th>
            <th className="px-4 py-3 font-medium">Delivered</th>
            <th className="px-4 py-3 font-medium">Opened</th>
            <th className="px-4 py-3 font-medium">Clicked</th>
            <th className="px-4 py-3 font-medium">Click to open</th>
            <th className="px-4 py-3 font-medium">Bounced</th>
            <th className="px-4 py-3 font-medium">Unsubscribed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rt = rates(r);
            const href = hrefFor?.(r);
            return (
              <tr key={r.key} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  {href ? <Link href={href} className="font-medium hover:underline">{r.label}</Link> : <span className="font-medium">{r.label}</span>}
                  {r.sub && <p className="text-xs text-ink-soft">{r.sub}</p>}
                </td>
                <td className="px-4 py-3">{r.sent}</td>
                <td className="px-4 py-3">{fmtPct(rt.delivery)}</td>
                <td className="px-4 py-3">{r.tracked > 0 ? <>{fmtPct(rt.open)} <span className="text-xs text-ink-soft">({r.opened})</span></> : "not tracked"}</td>
                <td className="px-4 py-3">{fmtPct(rt.click)} <span className="text-xs text-ink-soft">({r.clicked})</span></td>
                <td className="px-4 py-3">{fmtPct(rt.clickToOpen)}</td>
                <td className={`px-4 py-3 ${(rt.bounce ?? 0) >= 2 ? "text-red-600" : ""}`}>{r.bounced > 0 ? `${r.bounced} (${fmtPct(rt.bounce)})` : "0"}</td>
                <td className="px-4 py-3">{r.unsubscribed > 0 ? `${r.unsubscribed} (${fmtPct(rt.unsubscribe)})` : "0"}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td className="px-4 py-3 text-ink-soft" colSpan={8}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, note, first, children }: { title: string; note?: string; first?: boolean; children: React.ReactNode }) {
  return (
    <section className={first ? "" : "mt-10"}>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {note && <p className="mt-1 max-w-3xl text-sm text-ink-soft">{note}</p>}
      {children}
    </section>
  );
}

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "emails", label: "Emails" },
  { value: "engagement", label: "Clicks & timing" },
  { value: "audience", label: "Audience" },
  { value: "problems", label: "Problems" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/** Only http(s) links are rendered as links (click targets are logged from
 * signed tokens, but never trust a stored URL in an href). */
function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

function OverviewTab({ current, previous, daily, marketable, contacts }: {
  current: Metrics;
  previous: Metrics;
  daily: Awaited<ReturnType<typeof getDaily>>;
  marketable: number;
  contacts: number;
}) {
  const now = rates(current);
  const before = previous.sent > 0 ? rates(previous) : null;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi value={String(current.sent)} label="Sent" detail={`to ${current.recipients} people`}
          delta={<span className="text-xs text-ink-soft">{previous.sent} in the previous period</span>} />
        <Kpi value={fmtPct(now.delivery)} label="Delivered" detail={`${current.delivered} reached the inbox server`}
          delta={<Delta now={now.delivery} before={before?.delivery ?? null} />} />
        <Kpi value={fmtPct(now.open)} label="Open rate" detail={`${current.opened} of ${current.tracked} tracked emails`}
          delta={<Delta now={now.open} before={before?.open ?? null} />} />
        <Kpi value={fmtPct(now.click)} label="Click rate" detail={`${current.clicked} clicked, ${fmtPct(now.clickToOpen)} of openers`}
          delta={<Delta now={now.click} before={before?.click ?? null} />} />
        <Kpi value={fmtPct(now.bounce)} label="Bounce rate" detail={`${current.bounced} bounced. Keep under 2%.`}
          delta={<Delta now={now.bounce} before={before?.bounce ?? null} lowerIsBetter />} />
        <Kpi value={fmtPct(now.unsubscribe, 2)} label="Unsubscribe rate" detail={`${current.unsubscribed} unsubscribed`}
          delta={<Delta now={now.unsubscribe} before={before?.unsubscribe ?? null} lowerIsBetter />} />
        <Kpi value={fmtPct(now.complaint, 2)} label="Spam complaint rate" detail={`${current.complained} complaints. Keep under 0.1%.`}
          delta={<Delta now={now.complaint} before={before?.complaint ?? null} lowerIsBetter />} />
        <Kpi value={String(marketable)} label="Marketable contacts" detail={`subscribed and deliverable, of ${contacts} contacts`} />
      </div>

      <Section title="Day by day" note="Emails sent each day, and the first opens and clicks that happened that day.">
        <div className="mt-3 rounded-2xl border border-line bg-paper p-4">
          <EmailDailyChart data={daily} />
        </div>
      </Section>

      <div className="mt-10 rounded-2xl border border-line bg-paper p-5 text-sm text-ink-soft">
        <h2 className="font-medium text-ink">How these numbers work</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Rates are for the emails sent in the chosen period, counting everything that happened to them since.</li>
          <li>Opens come from a hidden image. Apple Mail loads it automatically, so some opens are not real reads; clicks are the stronger signal. Admin alerts and login codes are not open-tracked.</li>
          <li>Delivery, bounces and spam complaints come from Amazon SES. Opens, clicks and unsubscribes are tracked by the site.</li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-4">
          <a className="underline" href="https://postmaster.google.com/" target="_blank" rel="noreferrer">Google Postmaster (Gmail reputation)</a>
          <a className="underline" href="https://ap-south-1.console.aws.amazon.com/ses/home?region=ap-south-1#/reputation" target="_blank" rel="noreferrer">Amazon SES reputation</a>
        </div>
      </div>
    </>
  );
}

function EmailsTab({ breakdowns, type }: { breakdowns: Awaited<ReturnType<typeof getBreakdowns>>; type: string }) {
  return (
    <>
      {!type && (
        <Section title="By type" first>
          <BreakdownTable
            rows={breakdowns.byType.map((r) => ({ ...r, label: CATEGORY_LABELS[r.key] || r.key }))}
            nameHeader="Type" empty="Nothing sent in this period."
          />
        </Section>
      )}
      {(!type || type === "campaign") && (
        <Section title="Campaigns" note="Each newsletter or broadcast sent in this period." first={type === "campaign"}>
          <BreakdownTable rows={breakdowns.campaigns} nameHeader="Campaign" empty="No campaigns sent in this period."
            hrefFor={(r) => `/console/email/campaigns/${encodeURIComponent(r.key)}`} />
        </Section>
      )}
      {(!type || type === "automation") && (
        <Section title="Automation emails" note="Every email in every automation, so you can see which step people drop off at." first={type === "automation"}>
          <BreakdownTable rows={breakdowns.flows} nameHeader="Automation" empty="No automation emails sent in this period."
            hrefFor={(r) => `/console/email/automation/${(r as BreakdownRow & { flow_id: number }).flow_id}`} />
        </Section>
      )}
      {(!type || type === "fixed") && (
        <Section title="Transactional emails" note="Account, course, payment, meeting and other one-off emails." first={type === "fixed"}>
          <BreakdownTable rows={breakdowns.templates} nameHeader="Email" empty="No transactional emails sent in this period." />
        </Section>
      )}
    </>
  );
}

function EngagementTab({ detail, domains }: {
  detail: Awaited<ReturnType<typeof getEngagementDetail>>;
  domains: BreakdownRow[];
}) {
  return (
    <>
      <Section title="Most clicked links" note="Links people clicked in this period. People counts each email once." first>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Link</th>
                <th className="px-4 py-3 font-medium">People</th>
                <th className="px-4 py-3 font-medium">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {detail.links.map((l) => {
                const href = safeHref(l.url);
                const label = l.url.replace(/^https?:\/\/(www\.)?/, "");
                return (
                  <tr key={l.url} className="border-b border-line last:border-0">
                    <td className="max-w-md truncate px-4 py-3">
                      {href ? <a href={href} target="_blank" rel="noreferrer" className="hover:underline">{label}</a> : label}
                    </td>
                    <td className="px-4 py-3">{l.people}</td>
                    <td className="px-4 py-3">{l.clicks}</td>
                  </tr>
                );
              })}
              {detail.links.length === 0 && (
                <tr><td className="px-4 py-3 text-ink-soft" colSpan={3}>No clicks in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Section title="When people open" note="First opens by hour, India time. Use it to pick a send time.">
          <div className="mt-3 rounded-2xl border border-line bg-paper p-4">
            <OpensByHourChart data={detail.hours} />
          </div>
        </Section>

        <Section title="By inbox provider" note="A low delivery or open rate at one provider points to a spam-folder problem there.">
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-paper">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Sent</th>
                  <th className="px-4 py-3 font-medium">Delivered</th>
                  <th className="px-4 py-3 font-medium">Opened</th>
                  <th className="px-4 py-3 font-medium">Bounced</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((r) => {
                  const rt = rates(r);
                  return (
                    <tr key={r.key} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">{r.key}</td>
                      <td className="px-4 py-3">{r.sent}</td>
                      <td className="px-4 py-3">{fmtPct(rt.delivery)}</td>
                      <td className="px-4 py-3">{fmtPct(rt.open)}</td>
                      <td className="px-4 py-3">{r.bounced}</td>
                    </tr>
                  );
                })}
                {domains.length === 0 && (
                  <tr><td className="px-4 py-3 text-ink-soft" colSpan={5}>Nothing sent in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </>
  );
}

function AudienceTab({ audience }: { audience: Awaited<ReturnType<typeof getAudience>> }) {
  return (
    <Section title="Active people right now" first note="The date filter does not apply here. Email activity is any open or click. Website activity is a signed-in visit, so it only covers people with an account.">
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi value={String(audience.email_7)} label="Opened an email, last 7 days" detail={`${audience.email_30} in 30 days, ${audience.email_90} in 90 days`} />
        <Kpi value={String(audience.site_7)} label="Used the website, last 7 days" detail={`${audience.site_30} in 30 days, ${audience.site_90} in 90 days`} />
        <Kpi value={String(audience.subscribed_quiet_90)} label="Subscribers gone quiet" detail="opened before, nothing in 90 days" />
        <Kpi value={String(audience.subscribed_never_opened)} label="Subscribers who never opened" detail="no open or click recorded yet" />
        <Kpi value={String(audience.marketable)} label="Marketable contacts" detail={`subscribed and deliverable, of ${audience.contacts} contacts`} />
      </div>
      <p className="mt-4 text-sm text-ink-soft">
        To see or email these people, use the activity filters on{" "}
        <Link href="/console/contacts" className="underline">Contacts</Link> or the activity segments in{" "}
        <Link href="/console/email/segments" className="underline">Segments</Link>.
      </p>
    </Section>
  );
}

function ProblemsTab({ problems, blocked }: {
  problems: Awaited<ReturnType<typeof getEngagementDetail>>["problems"];
  blocked: { recipient_email: string; event: string; last_seen: string }[];
}) {
  return (
    <>
      <Section title="Bounces, complaints and unsubscribes" first note="Each one in this period. Hard bounces and spam complaints are suppressed automatically, so they never get emailed again.">
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">What happened</th>
                <th className="px-4 py-3 font-medium">Email it came from</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((r, i) => (
                <tr key={`${r.recipient_email}-${r.event}-${i}`} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">{r.recipient_email}</td>
                  <td className={`px-4 py-3 ${r.event === "spam" || r.event === "hard_bounce" ? "text-red-600" : ""}`}>
                    {PROBLEM_LABELS[r.event] || r.event}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{r.template_key || "–"}</td>
                  <td className="px-4 py-3 text-ink-soft">{new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</td>
                </tr>
              ))}
              {problems.length === 0 && (
                <tr><td className="px-4 py-3 text-ink-soft" colSpan={4}>None in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Addresses that can't be emailed" note="Current status, not limited to the date filter.">
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Since</th>
              </tr>
            </thead>
            <tbody>
              {blocked.map((r) => (
                <tr key={`${r.recipient_email}-${r.event}`} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">{r.recipient_email}</td>
                  <td className="px-4 py-3">{r.event.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-ink-soft">{new Date(r.last_seen).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
              {blocked.length === 0 && (
                <tr><td className="px-4 py-3 text-ink-soft" colSpan={3}>None.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

export default async function EmailAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const win = resolveWindow(params);
  const tab: Tab = TABS.some((t) => t.value === params.tab) ? (params.tab as Tab) : "overview";
  const typeLabel = ANALYTICS_TYPES.find((t) => t.value === win.type)?.label || "All email";

  // Tab links keep the current date range and type.
  const query = new URLSearchParams({ range: win.range });
  if (win.range === "custom") {
    query.set("from", win.from);
    query.set("to", win.to);
  }
  if (win.type) query.set("type", win.type);
  const tabHref = (value: string) => {
    const q = new URLSearchParams(query);
    if (value !== "overview") q.set("tab", value);
    return `/console/email/analytics?${q.toString()}`;
  };

  let body: React.ReactNode = null;
  if (tab === "overview") {
    const [current, previous, daily, audience] = await Promise.all([
      getMetrics(win.from, win.to, win.type),
      getMetrics(win.prevFrom, win.prevTo, win.type),
      getDaily(win.from, win.to, win.type),
      getAudience(),
    ]);
    body = <OverviewTab current={current} previous={previous} daily={daily} marketable={audience.marketable} contacts={audience.contacts} />;
  } else if (tab === "emails") {
    body = <EmailsTab breakdowns={await getBreakdowns(win.from, win.to, win.type)} type={win.type} />;
  } else if (tab === "engagement") {
    const [detail, breakdowns] = await Promise.all([
      getEngagementDetail(win.from, win.to, win.type),
      getBreakdowns(win.from, win.to, win.type),
    ]);
    body = <EngagementTab detail={detail} domains={breakdowns.domains} />;
  } else if (tab === "audience") {
    body = <AudienceTab audience={await getAudience()} />;
  } else {
    const [detail, blocked] = await Promise.all([
      getEngagementDetail(win.from, win.to, win.type),
      pool.query(`
        SELECT email AS recipient_email, deliverability_status AS event, updated_at AS last_seen
        FROM contacts WHERE deliverability_status <> 'ok'
        ORDER BY updated_at DESC LIMIT 25
      `),
    ]);
    body = <ProblemsTab problems={detail.problems} blocked={blocked.rows} />;
  }

  return (
    <div>
      <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Analytics sections">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={tabHref(t.value)}
            aria-current={tab === t.value ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.value ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-5">
        <EmailAnalyticsFilters
          tab={tab === "overview" ? "" : tab}
          range={win.range}
          from={win.from}
          to={win.to}
          type={win.type}
          today={todayInIndia()}
          presets={RANGE_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
          types={ANALYTICS_TYPES.map((t) => ({ value: t.value, label: t.label }))}
        />
        <p className="mt-3 text-sm text-ink-soft">
          {typeLabel}, {formatDay(win.from)} to {formatDay(win.to)} ({win.days} {win.days === 1 ? "day" : "days"}, India time).
          Compared with the {win.days} days before. Test sends are never counted.
        </p>
      </div>

      <div className="mt-6">{body}</div>
    </div>
  );
}
