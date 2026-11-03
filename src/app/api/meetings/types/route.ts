import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const result = await pool.query(`SELECT id, slug, name, description, duration_minutes FROM meeting_types WHERE active = true ORDER BY name ASC, id ASC`);
  return NextResponse.json({ types: result.rows });
}
