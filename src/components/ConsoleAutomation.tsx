"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConsoleModal from "@/components/ConsoleModal";
import BrandSelect from "@/components/BrandSelect";

const TRIGGERS = [
  { key: "user_signup_verified", label: "Someone verifies their email (any new account)", courseScoped: false },
  { key: "course_enroll_free", label: "Someone enrolls free in a course", courseScoped: true },
  { key: "course_purchase", label: "Someone buys a PRO course directly", courseScoped: true },
  { key: "course_upgrade_to_pro", label: "Someone upgrades from free to PRO on a course", courseScoped: true },
  { key: "course_inactivity", label: "Someone is inactive after enrolling / completing a lesson", courseScoped: true },
  { key: "course_completed", label: "Someone completes every accessible lesson in a course", courseScoped: true },
  { key: "newsletter_signup", label: "Someone confirms a newsletter signup", courseScoped: false },
  { key: "community_inactivity", label: "A community member has not created their first post", courseScoped: false },
];

type Flow = {
  id: number;
  name: string;
  trigger_key: string;
  active: boolean;
  step_count: number;
  created_at: string;
  course_id: number | null;
  course_title: string | null;
  purpose: "service" | "marketing";
  goal_type: string;
  entry_segment_name: string | null;
  sent_30d: number;
  opened_30d: number;
  clicked_30d: number;
};

type Course = { id: number; title: string; has_free_tier: boolean; has_pro_tier: boolean };

// Which courses are even eligible for a given trigger -- a course with no
// free tier at all (e.g. a fully-PRO course) can never fire
// "enrolls free", and a course with no price can never fire a purchase/
// upgrade trigger. Showing every course regardless was the actual bug:
// it let a flow get built against a course event that can never happen.
function eligibleCourses(courses: Course[], triggerKey: string): Course[] {
  if (triggerKey === "course_enroll_free") return courses.filter((c) => c.has_free_tier);
  if (triggerKey === "course_purchase" || triggerKey === "course_upgrade_to_pro") {
    return courses.filter((c) => c.has_pro_tier);
  }
  if (triggerKey === "course_inactivity" || triggerKey === "course_completed") return courses;
  return courses;
}

type Segment = { id: number; name: string };

export default function ConsoleAutomation({ flows, courses, segments }: { flows: Flow[]; courses: Course[]; segments: Segment[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [triggerKey, setTriggerKey] = useState(TRIGGERS[0].key);
  const [courseId, setCourseId] = useState<string>("");
  const [purpose, setPurpose] = useState("service");
  const [entrySegmentId, setEntrySegmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [purposeFilter, setPurposeFilter] = useState("all");
  const [triggerFilter, setTriggerFilter] = useState("all");

  const selectedTrigger = TRIGGERS.find((t) => t.key === triggerKey)!;
  const courseOptions = eligibleCourses(courses, triggerKey);
  const visibleFlows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return flows.filter((flow) => {
      if (statusFilter === "active" && !flow.active) return false;
      if (statusFilter === "paused" && flow.active) return false;
      if (purposeFilter !== "all" && flow.purpose !== purposeFilter) return false;
      if (triggerFilter !== "all" && flow.trigger_key !== triggerFilter) return false;
      if (!needle) return true;
      const triggerLabel = TRIGGERS.find((item) => item.key === flow.trigger_key)?.label || flow.trigger_key;
      return [flow.name, flow.course_title, flow.entry_segment_name, triggerLabel]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [flows, purposeFilter, query, statusFilter, triggerFilter]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/console/automation/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        triggerKey,
        courseId: selectedTrigger.courseScoped ? Number(courseId) : undefined,
        purpose,
        entrySegmentId: entrySegmentId ? Number(entrySegmentId) : undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error || "Something went wrong.");
      return;
    }
    setCreating(false);
    setName("");
    router.push(`/console/email/automation/${body.id}`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search flows, courses, or segments…" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink" />
          <BrandSelect value={statusFilter} onChange={setStatusFilter} options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "paused", label: "Paused" }]} compact />
          <BrandSelect value={purposeFilter} onChange={setPurposeFilter} options={[{ value: "all", label: "All purposes" }, { value: "service", label: "Service / relationship" }, { value: "marketing", label: "Marketing" }]} compact />
          <BrandSelect value={triggerFilter} onChange={setTriggerFilter} options={[{ value: "all", label: "All triggers" }, ...TRIGGERS.map((item) => ({ value: item.key, label: item.label }))]} compact />
        </div>
        <button type="button" onClick={() => setCreating(true)} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80">New flow</button>
      </div>
      <p className="mt-3 text-xs text-ink-soft">Showing {visibleFlows.length} of {flows.length} flows</p>

      <div className="mt-6 space-y-3">
        {visibleFlows.length === 0 && <p className="text-sm text-ink-soft">No flows match these filters.</p>}
        {visibleFlows.map((f) => (
          <Link
            key={f.id}
            href={`/console/email/automation/${f.id}`}
            className="flex items-center justify-between rounded-xl border border-line bg-paper px-5 py-4 text-sm transition-colors hover:border-ink"
          >
            <div>
              <p className="font-medium">
                {f.name}
                {f.course_title && (
                  <span className="ml-2 rounded-full bg-paper-soft px-2.5 py-0.5 text-xs font-normal text-ink-soft">
                    {f.course_title}
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {TRIGGERS.find((t) => t.key === f.trigger_key)?.label || f.trigger_key} · {f.step_count}{" "}
                {f.step_count === 1 ? "email" : "emails"}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {f.purpose === "marketing" ? "Marketing (consent required)" : "Service / relationship"}
                {f.entry_segment_name ? ` · Entry filter: ${f.entry_segment_name}` : " · Everyone who triggers it"}
                {f.goal_type !== "none" ? ` · Stops at ${f.goal_type.replace(/_/g, " ")}` : ""}
              </p>
              <p className="mt-2 text-xs text-ink-soft">
                Last 30 days: {f.sent_30d} sent · {f.opened_30d} opened · {f.clicked_30d} clicked
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                f.active ? "bg-emerald-100 text-emerald-800" : "bg-paper-soft text-ink-soft"
              }`}
            >
              {f.active ? "Active" : "Paused"}
            </span>
          </Link>
        ))}
      </div>

      {creating && (
        <ConsoleModal title="New email flow" onClose={() => setCreating(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Flow name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Welcome series"
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Send when...</label>
              <div className="mt-1">
                <BrandSelect
                  value={triggerKey}
                  onChange={(value) => {
                    setTriggerKey(value);
                    const nextCourses = eligibleCourses(courses, value);
                    setCourseId(nextCourses[0] ? String(nextCourses[0].id) : "");
                  }}
                  options={TRIGGERS.map((t) => ({ value: t.key, label: t.label }))}
                />
              </div>
            </div>
            {selectedTrigger.courseScoped && (
              <div>
                <label className="text-sm font-medium">Which course</label>
                <div className="mt-1">
                  {courseOptions.length === 0 ? (
                    <p className="text-sm text-red-600">
                      No course matches this trigger yet (
                      {triggerKey === "course_enroll_free" ? "none have a free tier" : "none have a price set"}).
                    </p>
                  ) : (
                    <BrandSelect
                      value={courseId}
                      onChange={setCourseId}
                      options={courseOptions.map((c) => ({ value: String(c.id), label: c.title }))}
                    />
                  )}
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Email purpose</label>
              <div className="mt-1">
                <BrandSelect
                  value={purpose}
                  onChange={setPurpose}
                  options={[
                    { value: "service", label: "Service / relationship — based on their action" },
                    { value: "marketing", label: "Marketing — newsletter consent required" },
                  ]}
                />
              </div>
              <p className="mt-1 text-xs text-ink-soft">Cross-sells and broad promotions should be marketing. Course help tied to an enrollment can be service.</p>
            </div>
            <div>
              <label className="text-sm font-medium">Optional entry segment</label>
              <div className="mt-1">
                <BrandSelect
                  value={entrySegmentId}
                  onChange={setEntrySegmentId}
                  options={[{ value: "", label: "No extra filter — everyone who triggers it" }, ...segments.map((s) => ({ value: String(s.id), label: s.name }))]}
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !name.trim() || (selectedTrigger.courseScoped && !courseId)}
              className="w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create flow"}
            </button>
          </div>
        </ConsoleModal>
      )}
    </div>
  );
}
