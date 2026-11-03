"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import BrandSelect from "@/components/BrandSelect";

type Enrollment = {
  enrollment_id: number;
  slug: string;
  title: string;
  tier: string;
  has_free_tier: boolean;
  total_lessons: number;
  completed_lessons: number;
};

export default function ContactEnrollmentRow({ enrollment }: { enrollment: Enrollment }) {
  const [tier, setTier] = useState(enrollment.tier);
  const [busy, setBusy] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const { confirm, dialog } = useConfirm();

  async function saveTier(next: string) {
    setBusy(true);
    setTier(next);
    await fetch(`/api/console/courses/enrollments/${enrollment.enrollment_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: next }),
    });
    setBusy(false);
  }

  async function handleRevoke() {
    const ok = await confirm({ message: `Revoke access to "${enrollment.title}"? This can't be undone.` });
    if (!ok) return;
    setBusy(true);
    await fetch(`/api/console/courses/enrollments/${enrollment.enrollment_id}`, { method: "DELETE" });
    setRevoked(true);
    setBusy(false);
  }

  if (revoked) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper-soft px-3 py-2.5">
      <div>
        <p className="text-sm font-medium">{enrollment.title}</p>
        <p className="text-xs text-ink-soft">
          {enrollment.completed_lessons}/{enrollment.total_lessons} lessons complete
        </p>
      </div>
      <div className="flex items-center gap-2">
        {enrollment.has_free_tier ? (
          <BrandSelect
            value={tier}
            disabled={busy}
            onChange={saveTier}
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
          onClick={handleRevoke}
          disabled={busy}
          className="text-xs font-medium text-red-600 underline hover:text-red-700 disabled:opacity-50"
        >
          Revoke
        </button>
      </div>
      {dialog}
    </div>
  );
}
