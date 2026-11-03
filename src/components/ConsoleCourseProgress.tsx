"use client";

import { Fragment, useMemo, useState } from "react";
import Avatar from "@/components/community/Avatar";
import { timeAgo } from "@/lib/timeAgo";
import type { LessonFunnelRow, StudentProgress } from "@/lib/courseAnalytics";

type Filter = "all" | "not_started" | "in_progress" | "completed" | "inactive";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "not_started", label: "Not started" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "inactive", label: "Inactive 7d+" },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function percent(done: number, total: number) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function statusOf(s: StudentProgress): Exclude<Filter, "all" | "inactive"> {
  if (s.completed_lessons === 0) return "not_started";
  if (s.accessible_lessons > 0 && s.completed_lessons >= s.accessible_lessons) return "completed";
  return "in_progress";
}

function isInactive(s: StudentProgress, now: number) {
  if (statusOf(s) === "completed") return false;
  const last = s.last_activity || s.enrolled_at;
  return now - new Date(last).getTime() > WEEK_MS;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-soft">
      <div className="h-full rounded-full bg-ink" style={{ width: `${value}%` }} />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export default function ConsoleCourseProgress({
  course,
  students,
  funnel,
}: {
  course: { id: number; slug: string; title: string; has_free_tier: boolean };
  students: StudentProgress[];
  funnel: LessonFunnelRow[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [now] = useState(() => Date.now());

  const stats = useMemo(() => {
    const total = students.length;
    const pro = students.filter((s) => s.tier === "pro").length;
    const completed = students.filter((s) => statusOf(s) === "completed").length;
    const notStarted = students.filter((s) => statusOf(s) === "not_started").length;
    const active = students.filter(
      (s) => s.last_activity && now - new Date(s.last_activity).getTime() <= WEEK_MS
    ).length;
    const avg = total
      ? Math.round(students.reduce((sum, s) => sum + percent(s.completed_lessons, s.accessible_lessons), 0) / total)
      : 0;
    return { total, pro, free: total - pro, completed, notStarted, active, avg };
  }, [students, now]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (q && !`${s.name || ""} ${s.email} ${s.username || ""}`.toLowerCase().includes(q)) return false;
      if (filter === "all") return true;
      if (filter === "inactive") return isInactive(s, now);
      return statusOf(s) === filter;
    });
  }, [students, filter, query, now]);

  const counts: Record<Filter, number> = {
    all: students.length,
    not_started: stats.notStarted,
    in_progress: students.filter((s) => statusOf(s) === "in_progress").length,
    completed: stats.completed,
    inactive: students.filter((s) => isInactive(s, now)).length,
  };

  return (
    <div className="space-y-10">
      <section>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Enrolled students"
            value={stats.total}
            hint={course.has_free_tier ? `${stats.pro} PRO · ${stats.free} free` : `${stats.pro} PRO`}
          />
          <Stat label="Average progress" value={`${stats.avg}%`} hint="of lessons they can access" />
          <Stat label="Completed" value={stats.completed} hint={`${stats.notStarted} not started yet`} />
          <Stat label="Active last 7 days" value={stats.active} hint="finished a lesson this week" />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold">Students</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="w-full max-w-xs rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-ink hover:text-ink"
              }`}
            >
              {f.label} ({counts[f.key]})
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-paper">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="w-56 px-4 py-3 font-medium">Progress</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
                <th className="px-4 py-3 font-medium">Enrolled</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const pct = percent(s.completed_lessons, s.accessible_lessons);
                const open = expanded === s.enrollment_id;
                return (
                  <Fragment key={s.enrollment_id}>
                    <tr className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar url={s.avatar_url} name={s.name || s.email} size={28} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{s.name || "n/a"}</p>
                            <p className="truncate text-xs text-ink-soft">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            s.tier === "pro" ? "bg-ink text-paper" : "bg-paper-soft text-ink-soft"
                          }`}
                        >
                          {s.tier}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ProgressBar value={pct} />
                          <span className="shrink-0 text-xs text-ink-soft">
                            {s.completed_lessons}/{s.accessible_lessons} · {pct}%
                          </span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-xs ${isInactive(s, now) ? "text-red-600" : "text-ink-soft"}`}>
                        {s.last_activity ? timeAgo(s.last_activity) : "Not started"}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-soft">
                        {timeAgo(s.enrolled_at)}
                        <span className="block">{s.granted_via}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : s.enrollment_id)}
                          className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-ink"
                        >
                          {open ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-line bg-paper-soft last:border-0">
                        <td colSpan={6} className="px-4 py-4">
                          {s.next_lesson_title && (
                            <p className="mb-3 text-xs text-ink-soft">
                              Next up: <span className="font-medium text-ink">{s.next_lesson_title}</span>
                            </p>
                          )}
                          <div className="grid gap-2 sm:grid-cols-2">
                            {s.modules.map((m) => {
                              const mp = percent(m.completed, m.total);
                              return (
                                <div key={m.module_id} className="rounded-xl border border-line bg-paper p-3">
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="truncate font-medium">{m.title}</span>
                                    <span className="shrink-0 text-ink-soft">
                                      {m.locked ? "Locked (PRO)" : `${m.completed}/${m.total}`}
                                    </span>
                                  </div>
                                  {!m.locked && (
                                    <div className="mt-2">
                                      <ProgressBar value={mp} />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-ink-soft" colSpan={6}>
                    {students.length === 0 ? "No students enrolled yet." : "No students match this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Progress counts lessons a student marked complete, out of the lessons their tier can open. Your own
          account and team admins are excluded.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold">Lesson completion</h2>
        <p className="mt-1 text-sm text-ink-soft">
          How many students finished each lesson, in order. A sharp drop shows where people stall.
        </p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-paper">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Lesson</th>
                <th className="w-64 px-4 py-3 font-medium">Completed</th>
                <th className="px-4 py-3 font-medium">Comments</th>
              </tr>
            </thead>
            <tbody>
              {funnel.map((l, i) => {
                const pct = percent(l.completions, l.eligible);
                const newModule = i === 0 || funnel[i - 1].module_title !== l.module_title;
                return (
                  <Fragment key={l.lesson_id}>
                    {newModule && (
                      <tr className="border-b border-line bg-paper-soft">
                        <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-ink-soft">
                          {l.module_title}
                          {l.tier === "pro" && <span className="ml-2 text-red-600">PRO</span>}
                        </td>
                      </tr>
                    )}
                    <tr className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">
                        <a
                          href={`/account/courses/${course.slug}/lessons/${l.lesson_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {l.lesson_title}
                        </a>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <ProgressBar value={pct} />
                          <span className="shrink-0 text-xs text-ink-soft">
                            {l.completions}/{l.eligible}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-soft">{l.comments || ""}</td>
                    </tr>
                  </Fragment>
                );
              })}
              {funnel.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-ink-soft" colSpan={3}>
                    No lessons yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
