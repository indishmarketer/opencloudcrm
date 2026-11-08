import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getCourseBySlug, getCourseCurriculum, getUserEnrollment } from "@/lib/courses";
import { getPublishedEntityPage } from "@/lib/sitePages";
import { sendEmailWithRetry } from "@/lib/emailOutbox";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { triggerEmailFlow, firstNameOf } from "@/lib/emailAutomation";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { getPublishedPage } from "@/lib/sitePages";

export const metadata = { title: "Enrolling…", robots: { index: false, follow: false } };

export default async function CourseEnrollPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await getPublishedPage("/courses"))) notFound();
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect(`/signup?redirect=${encodeURIComponent(`/courses/${slug}/enroll`)}`);

  const course = await getCourseBySlug(slug);
  if (!course || !course.published) notFound();

  const existingEnrollment = await getUserEnrollment(session.userId, course.id);
  if (existingEnrollment) redirect(`/account/courses/${course.slug}`);
  const modules = await getCourseCurriculum(course.id);
  if (!modules.some((module) => module.tier === "free")) {
    const salesPage = await getPublishedEntityPage("course", course.id);
    redirect(salesPage ? `/courses/${course.slug}/sales#purchase` : `/courses/${course.slug}#buy`);
  }

  const result = await pool.query(
    `INSERT INTO course_enrollments (user_id, course_id, tier, granted_via)
     VALUES ($1, $2, 'free', 'signup')
     ON CONFLICT (user_id, course_id) DO NOTHING
     RETURNING id`,
    [session.userId, course.id]
  );

  if (result.rows.length > 0) {
    const userRow = await pool.query("SELECT name FROM users WHERE id = $1", [session.userId]);
    const firstName = firstNameOf(userRow.rows[0]?.name);
    const grantTpl = await getEmailTemplate("course-access-granted-free");
    const grantVars = {
      first_name: escapeHtml(firstName),
      course_title: escapeHtml(course.title),
      course_url: `${SITE_URL}/account/courses/${encodeURIComponent(course.slug)}`,
    };
    await sendEmailWithRetry({
      to: session.email,
      subject: applyTemplateVars(grantTpl.subject, grantVars),
      html: applyTemplateVars(grantTpl.body_html, grantVars),
      from: grantTpl.from_email,
      templateKey: grantTpl.key,
      category: "fixed",
      trackOpens: grantTpl.track_opens,
    });
    triggerEmailFlow(
      "course_enroll_free",
      session.email,
      {
        course_title: course.title,
        course_url: `${SITE_URL}/courses/${course.slug}`,
        first_name: firstName,
      },
      course.id
    ).catch(() => {});
    emitWebhookEvent({
      eventType: "course.enrolled",
      source: "course_enrollments",
      sourceRecordId: result.rows[0].id,
      contactEmail: session.email,
      contactName: userRow.rows[0]?.name || null,
      userId: session.userId,
      data: { course_id: course.id, course_title: course.title, course_slug: course.slug, tier: "free" },
    }).catch(() => {});
  }

  // ?enrolled=1 only when this request actually just created the row (not
  // on a repeat visit to an existing free enrollment) -- EnrollTracked on
  // the destination page uses it to fire course_enroll exactly once.
  const justEnrolled = result.rows.length > 0;
  redirect(`/account/courses/${course.slug}${justEnrolled ? "?enrolled=1" : ""}`);
}
