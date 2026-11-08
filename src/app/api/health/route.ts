import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { readSiteIdentity } from "@/lib/siteIdentity";

// Used by Docker/Coolify healthchecks (see docker-compose.yml and the
// Dockerfile) to tell "the process is up" apart from "the app can
// actually serve a request" -- a brief DB hiccup or a not-yet-finished
// migration on first boot should show as unhealthy, not a false green.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    // Best-effort: also warms this container's last-known-good site
    // identity cache (see siteIdentity.ts) before Coolify ever routes real
    // traffic here, so a rolling deploy's brief old/new container overlap
    // can't flash the compiled-in placeholder name. Never fails the
    // healthcheck itself -- a real outage still needs to show unhealthy.
    readSiteIdentity().catch(() => {});
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
