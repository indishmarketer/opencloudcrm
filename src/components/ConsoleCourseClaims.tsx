"use client";

import { useState } from "react";
import ConsoleModal from "@/components/ConsoleModal";

type Claim = {
  id: number;
  method: string;
  reference: string | null;
  created_at: string;
  email: string;
  course_title: string;
};

export default function ConsoleCourseClaims({ claims }: { claims: Claim[] }) {
  const [claimList, setClaimList] = useState(claims);
  const [reviewClaim, setReviewClaim] = useState<{ claim: Claim; action: "approved" | "rejected" } | null>(null);

  async function resolveClaim() {
    if (!reviewClaim) return;
    await fetch(`/api/console/courses/claims/${reviewClaim.claim.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: reviewClaim.action }),
    });
    setClaimList((list) => list.filter((c) => c.id !== reviewClaim.claim.id));
    setReviewClaim(null);
  }

  return (
    <div>
      <h2 className="font-display text-2xl font-semibold mb-4">Pending payment claims</h2>
      <div className="space-y-3">
        {claimList.length === 0 && <p className="text-sm text-ink-soft">Nothing pending.</p>}
        {claimList.map((claim) => (
          <div key={claim.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper p-5">
            <div>
              <p className="text-sm font-medium">
                {claim.email} · {claim.course_title}
              </p>
              <p className="text-xs text-ink-soft">
                {claim.method} · ref: {claim.reference || "n/a"} ·{" "}
                {new Date(claim.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setReviewClaim({ claim, action: "approved" })}
                className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-80"
              >
                Approve
              </button>
              <button
                onClick={() => setReviewClaim({ claim, action: "rejected" })}
                className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium text-red-600 hover:border-red-500"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {reviewClaim && (
        <ConsoleModal
          title={reviewClaim.action === "approved" ? "Approve payment?" : "Reject payment?"}
          onClose={() => setReviewClaim(null)}
        >
          <p className="text-sm text-ink-soft">
            {reviewClaim.action === "approved"
              ? `Grant ${reviewClaim.claim.email} PRO access to ${reviewClaim.claim.course_title}?`
              : `Reject this claim from ${reviewClaim.claim.email}? No access will be granted.`}
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => setReviewClaim(null)}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink"
            >
              Cancel
            </button>
            <button
              onClick={resolveClaim}
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80"
            >
              Confirm
            </button>
          </div>
        </ConsoleModal>
      )}
    </div>
  );
}
