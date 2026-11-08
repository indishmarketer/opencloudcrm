import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { readSiteIdentity } from "@/lib/siteIdentity";
import { __warmPublishedPage } from "@/lib/sitePages";

// Used by Docker/Coolify healthchecks (see docker-compose.yml and the
// Dockerfile) to tell "the process is up" apart from "the app can
// actually serve a request" -- a brief DB hiccup or a not-yet-finished
// migration on first boot should show as unhealthy, not a false green.
export const dynamic = "force-dynamic";

// The home page and most content pages (`revalidate = 300`) are statically
// prerendered at `next build` time, which runs in CI with no database --
// so the version baked into every image is the neutral placeholder/starter
// copy, not this deployment's real content. That cached version stays
// "fresh" (served as-is, no regeneration) for a full 5 minutes after the
// container starts, which on the project's generic self-host image means
// every single deploy shows the wrong site to every visitor for up to 5
// minutes, 100% of the time -- not just an occasional race. Fixed by
// invalidating the whole site's static cache exactly once, the first time
// this container passes its healthcheck (i.e. before Coolify/Docker ever
// routes real traffic to it), so the first real request regenerates each
// page from the live DB instead of serving the build-time placeholder.
let warmedOnce = false;

export async function GET() {
  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    // Best-effort: warms this container's last-known-good site identity
    // and homepage caches (see siteIdentity.ts / sitePages.ts) on every
    // check, so a later transient DB hiccup has a real value to fall back
    // to instead of the compiled-in placeholder. Never fails the
    // healthcheck itself -- a real outage still needs to show unhealthy.
    readSiteIdentity().catch(() => {});
    __warmPublishedPage("/").catch(() => {});
    if (!warmedOnce) {
      warmedOnce = true;
      try {
        revalidatePath("/", "layout");
      } catch {
        // Outside a request context: nothing cached to clear yet.
      }
    }
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
