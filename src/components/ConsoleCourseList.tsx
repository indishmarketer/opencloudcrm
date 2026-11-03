"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConsoleModal from "@/components/ConsoleModal";
import { useConfirm } from "@/components/ConfirmDialog";
import type { CourseOverview } from "@/lib/courseAnalytics";

type Course = {
  id: number;
  slug: string;
  title: string;
  price: number | null;
  price_currency: "INR" | "USD";
  published: boolean;
  has_free_tier: boolean;
  has_pro_tier: boolean;
  overview: CourseOverview | null;
};

export default function ConsoleCourseList({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [courseList, setCourseList] = useState(courses);
  const { confirm, dialog } = useConfirm();

  const handleCreate = async () => {
    if (!title || !slug) {
      setError("Title and slug are required.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/console/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, slug }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error || "Could not create course.");
      setBusy(false);
      return;
    }
    const body = await res.json();
    router.push(`/console/courses/${body.course.id}`);
  };

  const autoSlug = (val: string) => {
    setTitle(val);
    setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
  };

  async function handleDelete(course: Course) {
    const ok = await confirm({
      message: `Permanently delete the draft course “${course.title}” and all of its draft curriculum? This cannot be undone.`,
      confirmLabel: "Delete draft",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/console/courses/${course.id}`, { method: "DELETE" });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.error || "Could not delete this course.");
      setCourseList((current) => current.filter((item) => item.id !== course.id));
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete this course.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setCreating(true)}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80"
        >
          Create Course
        </button>
      </div>
      <div className="space-y-3">
        {error && !creating && <p className="rounded-lg border border-red-600 p-3 text-sm text-red-600">{error}</p>}
        {courseList.map((c) => {
          let badge = "";
          if (c.has_free_tier && c.has_pro_tier) badge = "FREE + PRO";
          else if (c.has_free_tier) badge = "FREE";
          else if (c.has_pro_tier) badge = "PRO";
          else badge = "No Modules";

          return (
            <div key={c.id} className="rounded-2xl border border-line bg-paper p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link href={`/console/courses/${c.id}`} className="font-medium hover:underline">
                    {c.title}
                  </Link>
                  <p className="text-xs text-ink-soft mt-1">
                    {c.published ? "Published" : "Draft"} · {badge}
                    {" · "}
                    {c.price != null ? `${c.price_currency === "USD" ? "$" : "₹"}${c.price.toLocaleString(c.price_currency === "USD" ? "en-US" : "en-IN")}` : "No price"}
                  </p>
                  <p className="mt-2 text-xs text-ink-soft">
                    <span className="font-medium text-ink">{c.overview?.students ?? 0}</span> students
                    {c.has_free_tier && c.overview ? ` (${c.overview.pro_students} PRO)` : ""}
                    {" · "}
                    <span className="font-medium text-ink">{c.overview?.avg_progress ?? 0}%</span> avg progress
                    {" · "}
                    <span className="font-medium text-ink">{c.overview?.completed_students ?? 0}</span> completed
                    {" · "}
                    <span className="font-medium text-ink">{c.overview?.active_7d ?? 0}</span> active this week
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/console/courses/${c.id}/students`}
                    className="rounded-full border border-line px-4 py-1.5 text-xs font-medium hover:border-ink"
                  >
                    Students & progress
                  </Link>
                  <Link
                    href={`/console/courses/${c.id}`}
                    className="rounded-full border border-line px-4 py-1.5 text-xs font-medium hover:border-ink"
                  >
                    Edit Studio
                  </Link>
                  {!c.published && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      disabled={busy}
                      className="rounded-full border border-red-600 px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {courseList.length === 0 && (
          <p className="text-sm text-ink-soft">No courses found. Create one to get started.</p>
        )}
      </div>

      {creating && (
        <ConsoleModal title="Create Course" onClose={() => setCreating(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-ink-soft">Course Title</label>
              <input
                value={title}
                onChange={(e) => autoSlug(e.target.value)}
                placeholder="e.g. Masterclass 2026"
                className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">URL Slug</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. masterclass-2026"
                className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
              />
              <p className="mt-1 text-xs text-ink-soft">
                This forms the public URL (/courses/slug). Be careful changing this later if the course is published.
              </p>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => setCreating(false)}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={busy}
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </ConsoleModal>
      )}
      {dialog}
    </div>
  );
}
