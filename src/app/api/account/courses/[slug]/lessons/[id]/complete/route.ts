import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getCourseBySlug, getUserEnrollment, tierSatisfies } from "@/lib/courses";
import { firstNameOf, triggerEmailFlow } from "@/lib/emailAutomation";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { SITE_URL } from "@/lib/liveSiteUrl";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug, id } = await params;
  const lessonId = Number(id);
  if (!Number.isInteger(lessonId)) return NextResponse.json({ error: "Invalid lesson." }, { status: 400 });

  const course = await getCourseBySlug(slug);
  if (!course) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const enrollment = await getUserEnrollment(session.userId, course.id);
  if (!enrollment) return NextResponse.json({ error: "Not enrolled." }, { status: 403 });

  const lessonResult = await pool.query(
    `SELECT m.tier AS module_tier FROM course_lessons l
     JOIN course_modules m ON m.id = l.module_id
     WHERE l.id = $1 AND m.course_id = $2`,
    [lessonId, course.id]
  );
  const lesson = lessonResult.rows[0];
  if (!lesson || !tierSatisfies(enrollment.tier, lesson.module_tier)) {
    return NextResponse.json({ error: "Not accessible." }, { status: 403 });
  }

  const inserted = await pool.query(
    `INSERT INTO lesson_progress (user_id, lesson_id) VALUES ($1, $2)
     ON CONFLICT (user_id, lesson_id) DO NOTHING RETURNING lesson_id`,
    [session.userId, lessonId]
  );

  if (inserted.rowCount) {
    const completion = await pool.query(
      `SELECT COUNT(l.id)::int AS total, COUNT(lp.lesson_id)::int AS completed
       FROM course_modules m JOIN course_lessons l ON l.module_id = m.id
       LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $2
       WHERE m.course_id = $1 AND ($3 = 'pro' OR m.tier = 'free')`,
      [course.id, session.userId, enrollment.tier],
    );
    const progress = completion.rows[0];
    if (Number(progress?.total || 0) > 0 && Number(progress.completed) >= Number(progress.total)) {
      const user = await pool.query("SELECT email, name FROM users WHERE id = $1", [session.userId]);
      if (user.rows[0]) {
        await triggerEmailFlow("course_completed", user.rows[0].email, {
          first_name: firstNameOf(user.rows[0].name),
          course_title: course.title,
          course_url: `${SITE_URL}/account/courses/${course.slug}`,
        }, course.id, `course-completed:${course.id}:${session.userId}`);
        emitWebhookEvent({
          eventType: "course.completed",
          source: "courses",
          sourceRecordId: `${course.id}:${session.userId}`,
          contactEmail: user.rows[0].email,
          contactName: user.rows[0].name,
          userId: session.userId,
          data: { course_id: course.id, course_title: course.title, course_slug: course.slug },
        }).catch(() => {});
      }
    }
  }

  return NextResponse.json({ ok: true });
}
