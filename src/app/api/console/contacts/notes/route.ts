import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getAdminSessionEmail } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminEmail = await getAdminSessionEmail();
  const { userId, body } = await req.json();
  const userIdNum = Number(userId);
  if (!Number.isInteger(userIdNum) || !body || typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await pool.query(
    "INSERT INTO contact_notes (user_id, body, created_by) VALUES ($1, $2, $3) RETURNING id, body, created_by, created_at",
    [userIdNum, body.slice(0, 3000), adminEmail]
  );

  return NextResponse.json({ ok: true, note: result.rows[0] });
}
