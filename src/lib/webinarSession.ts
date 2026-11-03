export type WebinarSessionPhase = "waiting" | "live" | "ended";

export function webinarSessionState(
  sessionStart: Date | string,
  durationSeconds: number,
  now: Date | number = new Date(),
): { phase: WebinarSessionPhase; elapsedSeconds: number } {
  const start = new Date(sessionStart).getTime();
  const current = typeof now === "number" ? now : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(current) || durationSeconds <= 0) return { phase: "ended", elapsedSeconds: 0 };
  if (current < start) return { phase: "waiting", elapsedSeconds: 0 };
  const elapsedSeconds = Math.floor((current - start) / 1000);
  if (elapsedSeconds >= durationSeconds) return { phase: "ended", elapsedSeconds: durationSeconds };
  return { phase: "live", elapsedSeconds };
}
