import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { runDatabaseBackup } from "@/lib/dbBackup";

/** Separate route (and separate VPS crontab entry) from
 * /api/cron/course-nudge on purpose -- that route is the email dispatcher
 * and changes often; backups should never be coupled to that file's
 * release cadence or failure modes. Reuses CRON_SECRET (same trust
 * boundary: "the VPS crontab knows this secret"), no new secret needed. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  const expected = secret ? `Bearer ${secret}` : null;
  const isMatch =
    expected && auth &&
    expected.length === auth.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(auth));

  if (!isMatch) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDatabaseBackup();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Database backup failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown backup failure" },
      { status: 500 }
    );
  }
}
