"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import BrandSelect from "@/components/BrandSelect";

export type EmailRow = {
  id: number; subject: string; category: string | null; status: string; is_test: boolean;
  created_at: string; sent_at: string | null; delivered_at: string | null;
  first_opened_at: string | null; first_clicked_at: string | null; open_count: number; click_count: number;
};
export type WhatsAppRow = { id: number; direction: string; body: string | null; status: string | null; created_at: string };
export type TimelineRow = { id: string; kind: string; label: string; detail: string | null; at: string };
export type CourseRow = { enrollment_id: number; title: string; tier: string; total_lessons: number; completed_lessons: number; created_at: string };
export type PaymentRow = { id: number; course_title: string; amount: string | null; currency: string | null; method: string; status: string; created_at: string };
export type BookingRow = { id: string; title: string; detail: string; at: string };
export type SourceInfo = { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; landing_page: string | null; referrer: string | null; at: string } | null;

type Activity = { id: string; kind: string; title: string; detail: string | null; at: string; href?: string };
const formatTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const FILTERS = ["All activity", "Email", "WhatsApp", "Courses", "Payments", "Meetings & webinars", "Website", "Source"];
const PERIODS = ["Any time", "Today", "7 days", "30 days", "90 days"];
const FILTER_OPTIONS = FILTERS.map((f) => ({ value: f, label: f }));
const PERIOD_OPTIONS = PERIODS.map((p) => ({ value: p, label: p }));

export default function ContactActivity({ contactId, now, emails, whatsapp, whatsappCount, courses, payments, bookings, timeline, source }: {
  contactId: number;
  /** The database request time, so the date filters are anchored to
   * something fixed rather than being recomputed on every render. */
  now: string;
  emails: EmailRow[]; whatsapp: WhatsAppRow[]; whatsappCount: number;
  courses: CourseRow[]; payments: PaymentRow[]; bookings: BookingRow[]; timeline: TimelineRow[]; source: SourceInfo;
}) {
  const [kind, setKind] = useState("All activity");
  const [period, setPeriod] = useState("Any time");
  const [page, setPage] = useState(1);
  const items = useMemo<Activity[]>(() => [
    ...emails.map((e) => ({ id: `email-${e.id}`, kind: "Email", title: e.subject || "Email", detail: `${e.category || "Email"} · ${e.status}${e.first_clicked_at ? ` · clicked ${e.click_count}×` : e.first_opened_at ? ` · opened ${e.open_count}×` : ""}${e.is_test ? " · test" : ""}`, at: e.created_at })),
    ...whatsapp.map((m) => ({ id: `whatsapp-${m.id}`, kind: "WhatsApp", title: `${m.direction === "outbound" ? "Sent" : "Received"} WhatsApp message`, detail: [m.body || "Media message", m.status].filter(Boolean).join(" · "), at: m.created_at, href: `/console/whatsapp/messages/c-${contactId}` })),
    ...courses.map((c) => ({ id: `course-${c.enrollment_id}`, kind: "Courses", title: `Course access: ${c.title}`, detail: `${c.tier} · ${c.completed_lessons}/${c.total_lessons} lessons completed`, at: c.created_at })),
    ...payments.map((p) => ({ id: `payment-${p.id}`, kind: "Payments", title: `Payment: ${p.course_title}`, detail: `${p.amount != null ? `${p.currency || ""} ${p.amount}` : "Amount not recorded"} · ${p.method} · ${p.status}`, at: p.created_at })),
    ...bookings.map((b) => ({ id: b.id, kind: "Meetings & webinars", title: b.title, detail: b.detail, at: b.at })),
    ...timeline.map((t) => ({ id: t.id, kind: "Website", title: t.label, detail: t.detail, at: t.at })),
    ...(source && (source.utm_source || source.utm_medium || source.utm_campaign || source.landing_page || source.referrer) ? [{
      id: "source-first-touch", kind: "Source", title: "First known visit", detail: [source.utm_source && `Source: ${source.utm_source}`, source.utm_medium && `Medium: ${source.utm_medium}`, source.utm_campaign && `Campaign: ${source.utm_campaign}`, source.landing_page && `Page: ${source.landing_page}`, source.referrer && `Referrer: ${source.referrer}`].filter(Boolean).join(" · "), at: source.at,
    }] : []),
  ].filter((x) => Number.isFinite(new Date(x.at).getTime())).sort((a, b) => b.at.localeCompare(a.at)), [contactId, emails, whatsapp, courses, payments, bookings, timeline, source]);
  const cutoff = period === "Any time" ? 0 : new Date(now).getTime() - ({ "Today": 86400000, "7 days": 7 * 86400000, "30 days": 30 * 86400000, "90 days": 90 * 86400000 }[period] || 0);
  const filtered = items.filter((x) => (kind === "All activity" || x.kind === kind) && new Date(x.at).getTime() >= cutoff);
  const pageSize = 20, pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((Math.min(page, pages) - 1) * pageSize, Math.min(page, pages) * pageSize);

  return <section className="rounded-2xl border border-line bg-paper p-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-display text-lg font-semibold">Activity</h2><p className="mt-1 text-xs text-ink-soft">{filtered.length} matching events · newest first</p></div>
      <div className="flex flex-wrap gap-2">
        <BrandSelect
          value={kind}
          onChange={(val) => {
            setKind(val);
            setPage(1);
          }}
          options={FILTER_OPTIONS}
          className="min-w-[170px]"
        />
        <BrandSelect
          value={period}
          onChange={(val) => {
            setPeriod(val);
            setPage(1);
          }}
          options={PERIOD_OPTIONS}
          className="min-w-[120px]"
        />
      </div>
    </div>
    <div className="mt-5">
      {visible.length ? <ol className="relative ml-2 border-l border-line">{visible.map((item) => <li key={item.id} className="relative pb-5 pl-6 last:pb-0">
        <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-ink" />
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><p className="text-sm font-medium">{item.title}</p><time className="text-xs text-ink-soft">{formatTime(item.at)}</time></div>
        <p className="mt-1 text-xs text-ink-soft"><span className="font-medium">{item.kind}</span>{item.detail ? ` · ${item.detail}` : ""}</p>
        {item.href && <Link href={item.href} className="mt-1 inline-block text-xs underline">Open conversation</Link>}
      </li>)}</ol> : <p className="py-8 text-center text-sm text-ink-soft">No activity matches these filters.</p>}
    </div>
    {filtered.length > pageSize && <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-sm"><span className="text-xs text-ink-soft">Page {Math.min(page, pages)} of {pages} · {whatsappCount} WhatsApp messages total</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-full border border-line px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-line px-3 py-1.5 disabled:opacity-40">Next</button></div></div>}
  </section>;
}
