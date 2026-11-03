"use client";

import { useEffect, useState } from "react";

export default function WebinarReleaseGate({ releaseAt }: { releaseAt: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const releaseDate = new Date(releaseAt);
  if (!Number.isFinite(releaseDate.getTime())) return null;
  // Render nothing until the client clock is known, so the countdown and
  // local-time string are computed once on the client instead of differing
  // between the server and browser (hydration mismatch).
  if (!now) return null;
  const diffMs = releaseDate.getTime() - now.getTime();
  const localString = releaseDate.toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <div className="rounded-3xl border border-line bg-paper p-7 shadow-[0_20px_60px_rgba(10,10,10,0.08)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">You&apos;re registered</p>
      <h2 className="mt-3 font-display text-2xl font-semibold">Available {localString}</h2>
      {diffMs > 0 && <p className="mt-3 text-sm leading-6 text-ink-soft">Your access is saved. Come back in about {Math.max(1, Math.ceil(diffMs / 60_000))} minutes and the player will be ready here.</p>}
    </div>
  );
}
