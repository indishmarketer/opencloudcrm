import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

/** Plain DELETE revokes (soft) -- the key stops working immediately but
 * the row (and its history) stays. `?permanent=true` instead erases an
 * already-revoked row outright, for clearing out an ever-growing list of
 * dead keys. A key that's still active can't be erased this way -- it
 * has to be revoked first, same as everywhere else in the app. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const keyId = Number(id);
  if (!Number.isInteger(keyId)) return NextResponse.json({ error: "Invalid key." }, { status: 400 });

  if (req.nextUrl.searchParams.get("permanent") === "true") {
    try {
      const result = await pool.query("DELETE FROM api_tokens WHERE id = $1 AND revoked_at IS NOT NULL", [keyId]);
      if (result.rowCount === 0) {
        return NextResponse.json({ error: "Only an already-revoked key can be cleared." }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code?: unknown }).code === "23503") {
        return NextResponse.json(
          { error: "Can't clear this key -- it's still referenced by a directory submission made with it." },
          { status: 409 }
        );
      }
      throw err;
    }
  }

  await pool.query("UPDATE api_tokens SET revoked_at = now() WHERE id = $1", [keyId]);
  return NextResponse.json({ ok: true });
}
