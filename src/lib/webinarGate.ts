// Pure, DB-free webinar access gating logic — safe to import in node:test without next/headers or pg.
export type WebinarGateInputWebinar = {
  status: string;
  release_at: string | null;
  requires_registration: boolean;
  access_tier: string;
};

export type WatchGateInput = {
  webinar: WebinarGateInputWebinar;
  isOwner: boolean;
  hasRegistered: boolean;
  hasProAccess: boolean;
  now?: Date;
};

export type WatchGateResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "not_published" | "processing" | "errored" | "archived" | "release_pending" | "requires_registration" | "requires_pro";
      releaseAt?: string | null;
    };

export function canWatchWebinar(input: WatchGateInput): WatchGateResult {
  const { webinar, isOwner, hasRegistered, hasProAccess } = input;
  const now = input.now ?? new Date();

  if (webinar.status === "archived") return { allowed: false, reason: "archived" };
  if (webinar.status === "errored") return { allowed: false, reason: "errored" };
  if (webinar.status === "processing") return { allowed: false, reason: "processing" };
  if (webinar.status !== "published" && webinar.status !== "ready") return { allowed: false, reason: "not_published" };
  if (webinar.status === "ready" && !isOwner) return { allowed: false, reason: "not_published" };

  if (webinar.requires_registration && !hasRegistered && !isOwner) {
    return { allowed: false, reason: "requires_registration" };
  }

  if (webinar.release_at) {
    const releaseAt = new Date(webinar.release_at);
    if (Number.isFinite(releaseAt.getTime()) && releaseAt.getTime() > now.getTime() && !isOwner) {
      return { allowed: false, reason: "release_pending", releaseAt: webinar.release_at };
    }
  }

  if (webinar.access_tier === "pro" && !hasProAccess && !isOwner) {
    return { allowed: false, reason: "requires_pro" };
  }

  return { allowed: true };
}

export function isReleasePending(releaseAt: string | null, now?: Date): boolean {
  if (!releaseAt) return false;
  const t = new Date(releaseAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t > (now ?? new Date()).getTime();
}
