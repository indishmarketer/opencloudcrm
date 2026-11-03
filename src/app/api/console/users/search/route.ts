import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

/** People search for granting a course. Searches contacts, not only
 * accounts, so the owner can pick someone they added by hand; granting to a
 * contact with no account makes one (see /api/console/courses/enrollments). */
export async function GET(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 2) return NextResponse.json({ users: [] });

  const result = await pool.query(
    `SELECT c.id AS contact_id, u.id AS user_id, COALESCE(u.name, c.name) AS name, COALESCE(u.email, c.email) AS email
     FROM contacts c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.email ILIKE $1 OR c.name ILIKE $1 OR u.name ILIKE $1
     ORDER BY (u.id IS NULL), COALESCE(u.name, c.name) NULLS LAST LIMIT 10`,
    [`%${q}%`]
  );

  return NextResponse.json({
    users: result.rows.map((r) => ({
      contactId: Number(r.contact_id),
      userId: r.user_id ?? null,
      name: r.name,
      email: r.email,
    })),
  });
}
