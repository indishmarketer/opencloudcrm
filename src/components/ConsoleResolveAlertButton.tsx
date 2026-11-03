"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ConsoleResolveAlertButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function resolve() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/console/alerts/${id}`, { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      setError("Could not update. Try again.");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={resolve}
        disabled={busy}
        className="rounded-full border border-line px-4 py-1.5 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
      >
        {busy ? "Saving..." : "Mark done"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
