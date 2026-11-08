import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sendEmailWithRetry } from "@/lib/emailOutbox";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { firstNameOf } from "@/lib/emailAutomation";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/liveSiteUrl";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const enrollmentId = Number(id);
  const { tier } = await req.json();
  if (!Number.isInteger(enrollmentId) || !["free", "pro"].includes(tier)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await pool.query(
    `UPDATE course_enrollments SET tier = $1, granted_via = 'manual' WHERE id = $2
     RETURNING user_id, course_id`,
    [tier, enrollmentId]
  );
  const row = result.rows[0];

  if (row && tier === "pro") {
    const userResult = await pool.query("SELECT email, name FROM users WHERE id = $1", [row.user_id]);
    const courseResult = await pool.query("SELECT slug, title FROM courses WHERE id = $1", [row.course_id]);
    const user = userResult.rows[0];
    const course = courseResult.rows[0];
    if (user && course) {
      const tpl = await getEmailTemplate("course-access-upgraded");
      const vars = {
        first_name: escapeHtml(firstNameOf(user.name)),
        course_title: escapeHtml(course.title),
        course_url: `${SITE_URL}/account/courses/${encodeURIComponent(course.slug)}`,
      };
      await sendEmailWithRetry({
        to: user.email,
        subject: applyTemplateVars(tpl.subject, vars),
        html: applyTemplateVars(tpl.body_html, vars),
        from: tpl.from_email,
        templateKey: tpl.key,
        category: "fixed",
        trackOpens: tpl.track_opens,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const enrollmentId = Number(id);
  if (!Number.isInteger(enrollmentId)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  await pool.query("DELETE FROM course_enrollments WHERE id = $1", [enrollmentId]);
  return NextResponse.json({ ok: true });
}
