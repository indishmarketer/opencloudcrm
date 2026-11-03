"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";

type Course = { id: number; title: string; has_free_tier: boolean };

export default function ContactGrantCourse({
  contactId,
  hasAccount,
  courses,
}: {
  contactId: number;
  hasAccount: boolean;
  courses: Course[];
}) {
  const [courseId, setCourseId] = useState(String(courses[0]?.id ?? ""));
  const [tier, setTier] = useState("pro");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const router = useRouter();

  if (courses.length === 0) return null;

  const course = courses.find((c) => String(c.id) === courseId);

  async function grant() {
    setBusy(true);
    setError("");
    setDone("");
    const res = await fetch("/api/console/courses/enrollments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, courseId: Number(courseId), tier: course?.has_free_tier ? tier : "pro" }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Could not grant access.");
      return;
    }
    const parts = ["Access granted."];
    if (body.createdAccount) parts.push("We made them an account.");
    parts.push(body.emailed ? "Email sent." : "The email will retry shortly.");
    setDone(parts.join(" "));
    router.refresh();
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5">
        <BrandSelect
          value={courseId}
          disabled={busy}
          onChange={setCourseId}
          options={courses.map((c) => ({ value: String(c.id), label: c.title }))}
          compact
        />
        {course?.has_free_tier ? (
          <BrandSelect
            value={tier}
            disabled={busy}
            onChange={setTier}
            options={[
              { value: "free", label: "free" },
              { value: "pro", label: "pro" },
            ]}
            compact
          />
        ) : (
          <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-paper">pro</span>
        )}
        <button
          type="button"
          onClick={grant}
          disabled={busy}
          className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {busy ? "Granting…" : "Grant access"}
        </button>
      </div>
      {!hasAccount && !done && (
        <p className="mt-2 text-xs text-ink-soft">
          No account yet. Granting makes one and emails them a sign-in link to the course.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {done && <p className="mt-2 text-xs text-ink">{done}</p>}
    </div>
  );
}
