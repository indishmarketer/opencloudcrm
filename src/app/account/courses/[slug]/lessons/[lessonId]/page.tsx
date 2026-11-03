import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getCourseBySlug, getCourseCurriculum, getUserEnrollment, getCompletedLessonIds, tierSatisfies } from "@/lib/courses";
import { getUserProAccess } from "@/lib/community";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import CourseLessonPlayer from "@/components/CourseLessonPlayer";
import UnlockProModal from "@/components/UnlockProModal";
import { checkoutOffer, getCheckoutRegion, accountPhone } from "@/lib/checkoutRegion";
import { createPriceQuote } from "@/lib/priceQuote";
import { getCoursePrices } from "@/lib/currency";
import CourseCommentSection from "@/components/CourseCommentSection";
import LessonResources from "@/components/LessonResources";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?redirect=${encodeURIComponent(`/account/courses/${slug}/lessons/${lessonId}`)}`);

  const course = await getCourseBySlug(slug);
  if (!course) notFound();
  const prices = await getCoursePrices(course);

  const enrollment = await getUserEnrollment(session.userId, course.id);
  if (!enrollment) redirect(`/courses/${slug}`);

  const [modules, completedIds] = await Promise.all([
    getCourseCurriculum(course.id),
    getCompletedLessonIds(session.userId, course.id),
  ]);

  const flat = modules.flatMap((m) => m.lessons.map((l) => ({ ...l, moduleTier: m.tier, moduleTitle: m.title })));
  const idx = flat.findIndex((l) => l.id === Number(lessonId));
  if (idx === -1) notFound();
  const lesson = flat[idx];

  const tierLocked = !tierSatisfies(enrollment.tier, lesson.moduleTier);
  const priorLocked = !tierLocked && flat.slice(0, idx).some((l) => !completedIds.has(l.id));

  if (tierLocked) {
    const userName =
      (await pool.query("SELECT name FROM users WHERE id = $1", [session.userId])).rows[0]?.name || session.email;
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm text-ink-soft">
          <Link href={`/account/courses/${slug}`} className="hover:text-ink">
            {course.title}
          </Link>{" "}
          / {lesson.moduleTitle}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold">{lesson.title}</h1>

        <div className="relative mt-8 aspect-video w-full overflow-hidden rounded-2xl border border-line">
          <div className="absolute inset-0 bg-paper-soft blur-md" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink/40 px-6 text-center">
            <p className="font-display text-xl font-semibold text-paper">This lesson is part of PRO</p>
            <p className="max-w-sm text-sm text-paper/80">
              Unlock PRO to watch this lesson and the rest of the advanced modules.
            </p>
            <UnlockProModal
              courseId={course.id}
              courseSlug={course.slug}
              offer={checkoutOffer(await getCheckoutRegion(session.userId), prices)}
              priceQuote={createPriceQuote(course.id, prices)}
              userId={session.userId}
              userName={userName}
              userEmail={session.email}
              userPhone={await accountPhone(session.userId)}
            />
          </div>
        </div>
      </div>
    );
  }

  if (priorLocked) redirect(`/account/courses/${slug}`);

  const [hasProAccess, resourcesResult] = await Promise.all([
    getUserProAccess(session.userId),
    pool.query("SELECT id, label, url FROM lesson_resources WHERE lesson_id = $1 ORDER BY position, id", [
      lesson.id,
    ]),
  ]);
  const next = flat[idx + 1];
  const nextHref = next ? `/account/courses/${slug}/lessons/${next.id}` : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm text-ink-soft">
        <Link href={`/account/courses/${slug}`} className="hover:text-ink">
          {course.title}
        </Link>{" "}
        / {lesson.moduleTitle}
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">{lesson.title}</h1>
      {lesson.description && <p className="mt-3 text-ink-soft">{lesson.description}</p>}

      <div className="mt-8">
        <CourseLessonPlayer
          courseSlug={slug}
          lessonId={lesson.id}
          nextLessonHref={nextHref}
          alreadyCompleted={completedIds.has(lesson.id)}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-paper-soft px-5 py-4">
        <p className="text-sm text-ink-soft">Have a question about this lesson? Ask it in the community.</p>
        <Link
          href={hasProAccess ? "/community/pro" : "/community/general"}
          className="shrink-0 whitespace-nowrap rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink/90"
        >
          Go to Community
        </Link>
      </div>

      <LessonResources
        lessonId={lesson.id}
        resources={resourcesResult.rows}
        canManage={isConsoleOwner(session.email)}
      />

      <CourseCommentSection lessonId={lesson.id} />
    </div>
  );
}
