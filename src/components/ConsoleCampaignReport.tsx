"use client";

import { useState } from "react";
import Link from "next/link";
import BrandSelect from "@/components/BrandSelect";
import type { CampaignRecipient, CampaignSummary, RecipientState } from "@/lib/campaignReport";

/** Matches the dispatcher: 25 on send, then 25 per five-minute cron run. */
const BATCH_SIZE = 25;
const BATCH_MINUTES = 5;

const STATE_LABELS: Record<RecipientState, string> = {
  queued: "Queued",
  failed: "Failed",
  skipped: "Skipped",
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  bounced: "Bounced",
  complained: "Marked as spam",
};

const PROBLEM_STATES: RecipientState[] = ["failed", "bounced", "complained"];
const ENGAGED_STATES: RecipientState[] = ["sent", "delivered", "opened", "clicked"];
const PAGE_SIZES = [10, 20, 50, 100];

const FILTERS: { value: string; label: string; match: (r: CampaignRecipient) => boolean }[] = [
  { value: "all", label: "All", match: () => true },
  { value: "opened", label: "Opened", match: (r) => r.state === "opened" || r.state === "clicked" },
  { value: "clicked", label: "Clicked", match: (r) => r.state === "clicked" },
  { value: "not_opened", label: "Not opened", match: (r) => r.state === "delivered" || r.state === "sent" },
  { value: "problems", label: "Bounced / failed", match: (r) => PROBLEM_STATES.includes(r.state) || r.unsubscribed },
  { value: "queued", label: "Queued", match: (r) => r.state === "queued" },
];

function pct(part: number, whole: number): string {
  if (whole <= 0) return "–";
  const value = (part / whole) * 100;
  return `${value.toFixed(value >= 10 || value === 0 ? 0 : 1)}%`;
}

function when(value: string | null): string {
  if (!value) return "–";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Kpi({ value, label, detail, alert }: { value: string; label: string; detail?: string; alert?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <p className={`text-3xl font-semibold ${alert ? "text-red-600" : ""}`}>{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      {detail && <p className="mt-0.5 text-xs text-ink-soft">{detail}</p>}
    </div>
  );
}

export function CampaignAnalytics({ summary, links }: {
  summary: CampaignSummary;
  links: { url: string; clicks: number; people: number }[];
}) {
  const s = summary;
  const minutesLeft = Math.ceil(s.queued / BATCH_SIZE) * BATCH_MINUTES;

  return (
    <div>
      {s.queued > 0 && (
        <div className="mb-4 rounded-2xl border border-line bg-paper-soft p-4 text-sm">
          <p className="font-medium">
            Sending: {s.recipients - s.queued} of {s.recipients} done, {s.queued} still queued.
          </p>
          <p className="mt-1 text-ink-soft">
            Campaigns go out in batches of {BATCH_SIZE} every {BATCH_MINUTES} minutes to protect sender reputation.
            About {minutesLeft} minutes left. Refresh to update.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi value={String(s.sent)} label="Sent" detail={`of ${s.recipients} recipients`} />
        <Kpi value={pct(s.delivered, s.sent)} label="Delivered" detail={`${s.delivered} emails`} />
        <Kpi value={pct(s.opened, s.delivered)} label="Opened" detail={`${s.opened} people`} />
        <Kpi value={pct(s.clicked, s.delivered)} label="Clicked" detail={`${s.clicked} people, ${pct(s.clicked, s.opened)} of openers`} />
        <Kpi value={String(s.bounced)} label="Bounced" detail={pct(s.bounced, s.sent)} alert={s.bounced > 0} />
        <Kpi value={String(s.complained)} label="Marked as spam" alert={s.complained > 0} />
        <Kpi value={String(s.unsubscribed)} label="Unsubscribed" detail={pct(s.unsubscribed, s.delivered)} />
        <Kpi
          value={String(s.failed + s.skipped)}
          label="Not sent"
          detail={`${s.failed} failed, ${s.skipped} skipped`}
          alert={s.failed > 0}
        />
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        First sent {when(s.first_sent_at)}, last sent {when(s.last_sent_at)}. Opens are approximate: some mail apps
        load images automatically or block them. Clicks are the reliable signal.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Links clicked</h2>
        {links.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No clicks yet.</p>
        ) : (
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
                {links.map((link) => (
                  <tr key={link.url} className="border-b border-line last:border-0">
                    <td className="max-w-md truncate px-4 py-3">{link.url}</td>
                    <td className="px-4 py-3">{link.people}</td>
                    <td className="px-4 py-3">{link.clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function CampaignRecipients({ recipients }: { recipients: CampaignRecipient[] }) {
  const [filter, setFilter] = useState("all");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(0);
  const active = FILTERS.find((f) => f.value === filter) || FILTERS[0];
  const matching = recipients.filter(active.match);
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = matching.slice(current * pageSize, (current + 1) * pageSize);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setFilter(f.value);
              setPage(0);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.value ? "bg-ink text-paper" : "border border-line text-ink-soft hover:border-ink hover:text-ink"
            }`}
          >
            {f.label} ({recipients.filter(f.match).length})
          </button>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Sent</th>
              <th className="px-4 py-3 font-medium">Opens</th>
              <th className="px-4 py-3 font-medium">Clicks</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.contact_id ?? "x"}-${i}`} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  {r.contact_id ? (
                    <Link href={`/console/contacts/c-${r.contact_id}`} className="hover:underline">{r.email}</Link>
                  ) : (
                    r.email
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={PROBLEM_STATES.includes(r.state) ? "font-medium text-red-600" : ""}>
                    {STATE_LABELS[r.state]}
                  </span>
                  {r.unsubscribed && <span className="ml-1 text-xs text-red-600">· unsubscribed</span>}
                  {r.detail && !ENGAGED_STATES.includes(r.state) && <p className="text-xs text-ink-soft">{r.detail}</p>}
                </td>
                <td className="whitespace-nowrap px-4 py-3">{when(r.sent_at)}</td>
                <td className="px-4 py-3">{r.open_count > 0 ? `${r.open_count} (first ${when(r.first_opened_at)})` : "–"}</td>
                <td className="px-4 py-3">{r.click_count > 0 ? `${r.click_count} (first ${when(r.first_clicked_at)})` : "–"}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-ink-soft" colSpan={5}>No recipients here.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-ink-soft">
          <span>Rows per page</span>
          <div className="w-24">
            <BrandSelect
              value={String(pageSize)}
              onChange={(v) => {
                setPageSize(Number(v));
                setPage(0);
              }}
              options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
              compact
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-ink-soft">
            {matching.length === 0
              ? "0 of 0"
              : `${current * pageSize + 1}–${Math.min((current + 1) * pageSize, matching.length)} of ${matching.length}`}
          </span>
          <button
            type="button"
            onClick={() => setPage(current - 1)}
            disabled={current === 0}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage(current + 1)}
            disabled={current >= pages - 1}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
