import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

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
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
