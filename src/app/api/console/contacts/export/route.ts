import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(`
    SELECT c.id AS contact_id, c.email, COALESCE(c.name, u.name) AS name, c.phone,
      c.first_seen_at AS first_seen, c.marketing_status, c.deliverability_status,
      (c.user_id IS NOT NULL) AS has_account,
      EXISTS (SELECT 1 FROM contact_submissions cs WHERE lower(trim(cs.email)) = c.normalized_email) AS has_contact,
      EXISTS (SELECT 1 FROM newsletter_subscribers ns WHERE lower(trim(ns.email)) = c.normalized_email) AS has_newsletter,
      EXISTS (SELECT 1 FROM product_leads pl WHERE pl.user_id = c.user_id) AS has_product_lead,
      EXISTS (SELECT 1 FROM course_enrollments ce WHERE ce.user_id = c.user_id) AS has_course,
      EXISTS (SELECT 1 FROM community_memberships cm WHERE cm.user_id = c.user_id) AS has_community,
      EXISTS (SELECT 1 FROM author_applications aa WHERE aa.user_id = c.user_id) AS has_author_application,
      EXISTS (SELECT 1 FROM directory_tools dt WHERE dt.submitted_by_user_id = c.user_id) AS has_tool_submission
    FROM contacts c LEFT JOIN users u ON u.id = c.user_id
    ORDER BY c.first_seen_at DESC
  `);

  return new NextResponse(toCsv(result.rows), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="contacts.csv"`,
    },
  });
}
