import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getAdminSessionEmail } from "@/lib/auth";

/**
 * Two different things, deliberately kept apart.
 *
 * `view` means the owner has seen the line. It drops the unread count in
 * the console header and nothing else. Opening a notification is not the
 * same as dealing with what it is about: a submitted tool still needs
 * approving after it has been read, and a notification that marked itself
 * done on click would quietly lose that work.
 *
 * `resolve` means handled, which is the one that takes it off the list.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  // Defaults to resolve so the existing button, which sends no body, keeps
  // working exactly as it did.
  const action = body?.action === "view" ? "view" : body?.action === "unresolve" ? "unresolve" : "resolve";

  if (action === "view") {
    await pool.query(
      "UPDATE system_alerts SET viewed_at = now() WHERE id = $1 AND viewed_at IS NULL",
      [id],
    );
    return NextResponse.json({ ok: true, action });
  }

  if (action === "unresolve") {
    // For the inevitable misclick, and for a problem that comes back.
    await pool.query(
      "UPDATE system_alerts SET resolved_at = NULL, resolved_by = NULL WHERE id = $1",
      [id],
    );
    return NextResponse.json({ ok: true, action });
  }

  await pool.query(
    `UPDATE system_alerts
     SET resolved_at = now(), resolved_by = $2, viewed_at = coalesce(viewed_at, now())
     WHERE id = $1 AND resolved_at IS NULL`,
    [id, adminEmail],
  );
  return NextResponse.json({ ok: true, action });
}
