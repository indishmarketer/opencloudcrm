"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import { formatIndiaDateTime } from "@/lib/indiaTime";

export type CourseEnrollment = {
  enrollment_id: number;
  course_id: number;
  title: string;
  slug?: string;
  tier: "free" | "pro";
  granted_via?: string;
  created_at?: string;
};

export type CourseItem = {
  id: number;
  title: string;
  has_free_tier: boolean;
};

export default function ContactGrantCourse({
  contactId,
  hasAccount,
  courses,
  enrollments: initialEnrollments = [],
}: {
  contactId: number;
  hasAccount: boolean;
  courses: CourseItem[];
  enrollments?: CourseEnrollment[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"grant" | "revoke">("grant");
  const [activeEnrollments, setActiveEnrollments] = useState<CourseEnrollment[]>(initialEnrollments);

  // Grant state
  const [courseId, setCourseId] = useState(String(courses[0]?.id ?? ""));
  const [grantTier, setGrantTier] = useState<"free" | "pro">("pro");
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantError, setGrantError] = useState("");
  const [grantDone, setGrantDone] = useState("");

  // Revoke & Tier-change state
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmRevokeEnrollment, setConfirmRevokeEnrollment] = useState<CourseEnrollment | null>(null);

  const courseSelectOptions = useMemo(
    () =>
      courses.map((c) => {
        const enrolled = activeEnrollments.find((e) => e.course_id === c.id);
        return {
          value: String(c.id),
          label: enrolled ? `${c.title} • [${enrolled.tier.toUpperCase()}]` : c.title,
        };
      }),
    [courses, activeEnrollments],
  );

  if (courses.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-ink-soft">
        No courses have been created yet.
      </div>
    );
  }

  const selectedCourse = courses.find((c) => String(c.id) === courseId) || courses[0];
  const existingEnrollment = activeEnrollments.find((e) => e.course_id === selectedCourse?.id);

  function handleSelectCourse(newCourseId: string) {
    setCourseId(newCourseId);
    setGrantError("");
    setGrantDone("");
    const matched = courses.find((c) => String(c.id) === newCourseId);
    const existing = activeEnrollments.find((e) => e.course_id === Number(newCourseId));
    if (existing) {
      setGrantTier(existing.tier === "free" ? "pro" : matched?.has_free_tier ? "free" : "pro");
    } else {
      setGrantTier(matched?.has_free_tier ? "free" : "pro");
    }
  }

  async function handleGrant() {
    if (!selectedCourse) return;
    setGrantBusy(true);
    setGrantError("");
    setGrantDone("");
    try {
      const tierToSet = selectedCourse.has_free_tier ? grantTier : "pro";
      const res = await fetch("/api/console/courses/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          courseId: selectedCourse.id,
          tier: tierToSet,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not grant course access.");

      const isUpdate = Boolean(existingEnrollment);
      const enrollmentId = Number(body.enrollmentId || existingEnrollment?.enrollment_id || Date.now());

      setActiveEnrollments((prev) => {
        const without = prev.filter((e) => e.course_id !== selectedCourse.id);
        return [
          ...without,
          {
            enrollment_id: enrollmentId,
            course_id: selectedCourse.id,
            title: selectedCourse.title,
            tier: tierToSet,
            granted_via: "manual",
            created_at: new Date().toISOString(),
          },
        ];
      });

      const parts = [
        isUpdate
          ? `Access updated to ${tierToSet.toUpperCase()} tier.`
          : `Access granted to "${selectedCourse.title}" (${tierToSet.toUpperCase()} tier).`,
      ];
      if (body.createdAccount) parts.push("We made them an account.");
      parts.push(body.emailed ? "Email sent to student." : "The email will retry shortly.");
      setGrantDone(parts.join(" "));
      router.refresh();
    } catch (e) {
      setGrantError(e instanceof Error ? e.message : "Could not grant course access.");
    } finally {
      setGrantBusy(false);
    }
  }

  async function handleChangeTier(enrollment: CourseEnrollment, newTier: "free" | "pro") {
    setActionBusyId(enrollment.enrollment_id);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/console/courses/enrollments/${enrollment.enrollment_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: newTier }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not change course tier.");

      setActiveEnrollments((prev) =>
        prev.map((e) => (e.enrollment_id === enrollment.enrollment_id ? { ...e, tier: newTier } : e)),
      );
      setActionFeedback({ kind: "ok", text: `Updated "${enrollment.title}" to ${newTier.toUpperCase()} tier.` });
      router.refresh();
    } catch (e) {
      setActionFeedback({ kind: "error", text: e instanceof Error ? e.message : "Failed to change tier." });
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleRevoke(enrollment: CourseEnrollment) {
    setActionBusyId(enrollment.enrollment_id);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/console/courses/enrollments/${enrollment.enrollment_id}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not revoke course access.");

      setActiveEnrollments((prev) => prev.filter((e) => e.enrollment_id !== enrollment.enrollment_id));
      setConfirmRevokeEnrollment(null);
      setActionFeedback({ kind: "ok", text: `Access to "${enrollment.title}" has been revoked.` });
      router.refresh();
    } catch (e) {
      setActionFeedback({ kind: "error", text: e instanceof Error ? e.message : "Failed to revoke access." });
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex gap-2 rounded-full border border-line bg-paper-soft p-1 text-sm">
        <button
          type="button"
          onClick={() => {
            setMode("grant");
            setGrantError("");
            setGrantDone("");
          }}
          className={`flex-1 rounded-full px-4 py-1.5 font-medium transition-colors ${
            mode === "grant" ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
          }`}
        >
          Give course access
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("revoke");
            setActionFeedback(null);
            setConfirmRevokeEnrollment(null);
          }}
          className={`flex-1 rounded-full px-4 py-1.5 font-medium transition-colors flex items-center justify-center gap-1.5 ${
            mode === "revoke" ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
          }`}
        >
          <span>Revoke course access</span>
          {activeEnrollments.length > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                mode === "revoke" ? "bg-paper text-ink" : "bg-line text-ink"
              }`}
            >
              {activeEnrollments.length}
            </span>
          )}
        </button>
      </div>

      {/* Mode 1: Give Course Access */}
      {mode === "grant" && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Select Course</label>
            <div className="mt-1.5">
              <BrandSelect
                value={courseId}
                disabled={grantBusy}
                onChange={handleSelectCourse}
                options={courseSelectOptions}
                wrapOptions
              />
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              All courses appear here dynamically.
            </p>
          </div>

          {/* Current Status Badge & Guidance */}
          {existingEnrollment ? (
            <div className="rounded-xl border border-line bg-paper-soft p-3.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">Active Enrollment:</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    existingEnrollment.tier === "pro"
                      ? "bg-ink text-paper"
                      : "border border-line bg-paper text-ink"
                  }`}
                >
                  {existingEnrollment.tier.toUpperCase()} TIER
                </span>
              </div>
              <p className="text-ink-soft">
                {existingEnrollment.tier === "free"
                  ? "This contact currently has Free access. Select PRO below to upgrade them to full access."
                  : selectedCourse?.has_free_tier
                    ? "This contact currently has PRO access. Select Free below to change their access, or switch to the Revoke tab to remove it."
                    : "This contact currently has full PRO access. To remove their access, use the Revoke tab."}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-paper-soft/50 p-3 text-xs flex items-center justify-between">
              <span className="text-ink-soft">Access Status:</span>
              <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-soft border border-line">
                Not enrolled
              </span>
            </div>
          )}

          {/* Tier Selection */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Access Tier</label>
            <div className="mt-1.5">
              {selectedCourse?.has_free_tier ? (
                <div className="flex gap-2">
                  {(["free", "pro"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={grantBusy}
                      onClick={() => setGrantTier(t)}
                      className={`flex-1 rounded-xl border p-2.5 text-xs font-medium transition-colors text-center ${
                        grantTier === t
                          ? "border-ink bg-ink text-paper font-semibold"
                          : "border-line bg-paper text-ink hover:border-ink"
                      }`}
                    >
                      {t === "free" ? "Free Tier" : "PRO Tier (Full)"}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-xl border border-line bg-paper px-3.5 py-2.5 text-xs">
                  <span className="text-ink-soft">Course Tier:</span>
                  <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-paper">
                    PRO only
                  </span>
                </div>
              )}
            </div>
          </div>

          {!hasAccount && !grantDone && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900">
              No account yet. Granting access will automatically create an account for this contact and email them a direct sign-in link.
            </p>
          )}

          {grantError && (
            <p className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">{grantError}</p>
          )}
          {grantDone && (
            <p className="rounded-lg bg-green-50 border border-green-200 p-2.5 text-xs text-green-800 font-medium">{grantDone}</p>
          )}

          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={handleGrant}
              disabled={grantBusy}
              className="rounded-full bg-ink px-5 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              {grantBusy
                ? "Working…"
                : existingEnrollment
                  ? existingEnrollment.tier === grantTier
                    ? "Re-grant & Email Link"
                    : grantTier === "pro"
                      ? "Upgrade to PRO"
                      : "Change to Free"
                  : "Grant access"}
            </button>
          </div>
        </div>
      )}

      {/* Mode 2: Revoke Course Access */}
      {mode === "revoke" && (
        <div className="space-y-4">
          <p className="text-xs text-ink-soft">
            All courses this contact currently has access to are listed below. You can change their tier (Free ↔ PRO) or completely revoke access.
          </p>

          {actionFeedback && (
            <p
              className={`rounded-lg border p-2.5 text-xs font-medium ${
                actionFeedback.kind === "ok"
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {actionFeedback.text}
            </p>
          )}

          {/* Inline confirmation for revoking */}
          {confirmRevokeEnrollment && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
              <p className="text-sm font-semibold text-red-900">
                Revoke access to &quot;{confirmRevokeEnrollment.title}&quot;?
              </p>
              <p className="text-xs text-red-700">
                This contact will completely lose access to the course content and lessons.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={actionBusyId !== null}
                  onClick={() => setConfirmRevokeEnrollment(null)}
                  className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-ink hover:border-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionBusyId !== null}
                  onClick={() => handleRevoke(confirmRevokeEnrollment)}
                  className="rounded-full bg-red-600 px-3.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {actionBusyId === confirmRevokeEnrollment.enrollment_id ? "Revoking…" : "Yes, revoke access"}
                </button>
              </div>
            </div>
          )}

          {activeEnrollments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-8 text-center space-y-2">
              <p className="text-sm font-medium text-ink">No active course access</p>
              <p className="text-xs text-ink-soft">
                This contact is not currently enrolled in any courses.
              </p>
              <button
                type="button"
                onClick={() => setMode("grant")}
                className="mt-2 rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-medium text-ink hover:border-ink"
              >
                Give course access
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {activeEnrollments.map((enrollment) => {
                const courseDef = courses.find((c) => c.id === enrollment.course_id);
                const isBusy = actionBusyId === enrollment.enrollment_id;

                return (
                  <div
                    key={enrollment.enrollment_id}
                    className="rounded-xl border border-line bg-paper p-3.5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-sm text-ink truncate">{enrollment.title}</h4>
                        <p className="text-[11px] text-ink-soft mt-0.5">
                          Granted via {enrollment.granted_via || "manual"}
                          {enrollment.created_at ? ` · ${formatIndiaDateTime(enrollment.created_at)}` : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${
                          enrollment.tier === "pro"
                            ? "bg-ink text-paper"
                            : "border border-line bg-paper-soft text-ink"
                        }`}
                      >
                        {enrollment.tier.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/60 pt-2.5">
                      {/* Change Tier button if course has free tier */}
                      {courseDef?.has_free_tier && (
                        enrollment.tier === "pro" ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleChangeTier(enrollment, "free")}
                            className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink transition-colors hover:border-ink disabled:opacity-50"
                          >
                            {isBusy ? "Updating…" : "Revert to Free"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleChangeTier(enrollment, "pro")}
                            className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
                          >
                            {isBusy ? "Updating…" : "Upgrade to PRO"}
                          </button>
                        )
                      )}

                      {/* Revoke button */}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setActionFeedback(null);
                          setConfirmRevokeEnrollment(enrollment);
                        }}
                        className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 hover:border-red-300 disabled:opacity-50"
                      >
                        Revoke access
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
