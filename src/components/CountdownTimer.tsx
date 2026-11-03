"use client";

import { useEffect, useState } from "react";

/** Ticks once a second against a fixed UTC instant (see the "datetime"
 * field kind in pageBlocks.ts for why it's stored as UTC rather than a
 * floating local time) -- every visitor, in any timezone, counts down to
 * the same real moment. Renders nothing until mounted, so the server-
 * rendered markup (which has no "now") never mismatches the client's
 * first tick. */
export default function CountdownTimer({
  target,
  labels,
  expiredText,
}: {
  target: string;
  labels: { days: string; hours: string; minutes: string; seconds: string };
  expiredText: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeding "now" only once mounted client-side avoids a server/client hydration mismatch (the server has no "now" to render)
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null;
  const targetMs = Date.parse(target);
  if (Number.isNaN(targetMs)) return null;
  const diff = targetMs - now;

  if (diff <= 0) {
    return expiredText ? <p className="text-center text-lg font-medium">{expiredText}</p> : null;
  }

  const units = [
    { value: Math.floor(diff / 86_400_000), label: labels.days },
    { value: Math.floor((diff % 86_400_000) / 3_600_000), label: labels.hours },
    { value: Math.floor((diff % 3_600_000) / 60_000), label: labels.minutes },
    { value: Math.floor((diff % 60_000) / 1_000), label: labels.seconds },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8">
      {units.map((u) => (
        <div key={u.label} className="flex flex-col items-center">
          <span className="font-display text-3xl font-semibold tabular-nums sm:text-4xl">{String(u.value).padStart(2, "0")}</span>
          <span className="mt-1 text-xs uppercase tracking-wide text-ink-soft">{u.label}</span>
        </div>
      ))}
    </div>
  );
}
