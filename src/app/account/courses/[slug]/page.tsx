import { redirect, notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getCourseBySlug, getCourseCurriculum, getUserEnrollment, getCompletedLessonIds, tierSatisfies } from "@/lib/courses";
import UnlockProModal from "@/components/UnlockProModal";
import { checkoutOffer, getCheckoutRegion, accountPhone } from "@/lib/checkoutRegion";
import { createPriceQuote } from "@/lib/priceQuote";
import { getCoursePrices } from "@/lib/currency";
import EnrollTracked from "@/components/EnrollTracked";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  return { title: course?.title || "Course" };
}

export default async function CoursePlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?redirect=${encodeURIComponent(`/account/courses/${slug}`)}`);

  const course = await getCourseBySlug(slug);
  if (!course) notFound();

  const enrollment = await getUserEnrollment(session.userId, course.id);
  if (!enrollment) redirect(`/courses/${slug}`);
  const prices = await getCoursePrices(course);

  const [modules, completedIds] = await Promise.all([
    getCourseCurriculum(course.id),
    getCompletedLessonIds(session.userId, course.id),
  ]);

  // Precompute lock state per lesson before rendering (rather than mutating
  // a variable inside the JSX .map(), which the linter flags as a render
  // purity issue even though this runs once per server request).
  const lessonState = new Map<number, { unlocked: boolean; completed: boolean; tierUnlocked: boolean }>();
  let priorCompleted = true; // first lesson is always unlockable
  let totalUnlockedLessons = 0;
  let completedUnlockedLessons = 0;
  for (const m of modules) {
    const tierUnlocked = tierSatisfies(enrollment.tier, m.tier);
    for (const l of m.lessons) {
      const completed = completedIds.has(l.id);
      const unlocked = tierUnlocked && priorCompleted;
      lessonState.set(l.id, { unlocked, completed, tierUnlocked });
      if (!completed) priorCompleted = false;
      if (tierUnlocked) {
        totalUnlockedLessons++;
        if (completed) completedUnlockedLessons++;
      }
    }
  }
  const courseComplete = totalUnlockedLessons > 0 && completedUnlockedLessons === totalUnlockedLessons;

  const recommended = courseComplete
    ? (
        await pool.query(
          `SELECT c.slug, c.title, c.subtitle,
             EXISTS(SELECT 1 FROM course_modules m WHERE m.course_id = c.id AND m.tier = 'free') AS has_free_tier
           FROM courses c
           WHERE c.published = true AND c.id != $1
             AND NOT EXISTS (SELECT 1 FROM course_enrollments ce WHERE ce.course_id = c.id AND ce.user_id = $2)
           ORDER BY c.created_at DESC LIMIT 1`,
          [course.id, session.userId]
        )
      ).rows[0]
    : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Suspense fallback={null}>
        <EnrollTracked courseSlug={course.slug} />
      </Suspense>
      <p className="text-sm text-ink-soft">
        <Link href="/account" className="hover:text-ink">
          Your account
        </Link>{" "}
        / {course.title}
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">{course.title}</h1>

      {recommended && (
        <div className="mt-6 rounded-2xl border border-line bg-paper-soft p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Course complete 🎉</p>
          <p className="mt-2 font-display text-lg font-semibold">Keep going with {recommended.title}</p>
          {recommended.subtitle && <p className="mt-1 text-sm text-ink-soft">{recommended.subtitle}</p>}
          <Link
            href={`/courses/${recommended.slug}`}
            className="mt-4 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            {recommended.has_free_tier ? "Enroll for free" : "Take a look"}
          </Link>
        </div>
      )}

      {enrollment.tier === "free" && prices.base && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-paper-soft p-5">
          <p className="text-sm text-ink-soft">PRO modules are locked on the free tier.</p>
          <UnlockProModal
            courseId={course.id}
            courseSlug={course.slug}
            offer={checkoutOffer(await getCheckoutRegion(session.userId), prices)}
            priceQuote={createPriceQuote(course.id, prices)}
            userId={session.userId}
            userName={
              (await pool.query("SELECT name FROM users WHERE id = $1", [session.userId])).rows[0]?.name ||
              session.email
            }
            userEmail={session.email}
            userPhone={await accountPhone(session.userId)}
          />
        </div>
      )}

      <div className="mt-10 space-y-6">
        {modules.map((m) => {
          return (
            <div key={m.id}>
              <div className="flex items-center gap-2">
                <p className="font-medium">
                  Module {m.position}: {m.title}
                </p>
                {m.tier === "pro" && (
                  <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-paper">PRO</span>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {m.lessons.map((l) => {
                  const { unlocked, completed, tierUnlocked } = lessonState.get(l.id)!;
                  // PRO-locked lessons are still clickable -- they lead to the
                  // paywall on the lesson page, which is a better upsell than
                  // a dead row. Drip-locked (same tier, prior not done) stays
                  // non-clickable since there's nothing to buy there.
                  return (
                    <div key={l.id}>
                      {unlocked || !tierUnlocked ? (
                        <Link
                          href={`/account/courses/${course.slug}/lessons/${l.id}`}
                          className="flex items-center justify-between rounded-xl border border-line bg-paper px-4 py-3 text-sm transition-colors hover:border-ink"
                        >
                          <span>{l.title}</span>
                          <span className="text-xs text-ink-soft">
                            {!tierUnlocked ? "PRO only" : completed ? "Done" : "Start"}
                          </span>
                        </Link>
                      ) : (
                        <div className="flex items-center justify-between rounded-xl border border-line bg-paper-soft px-4 py-3 text-sm text-ink-soft">
                          <span>{l.title}</span>
                          <span className="text-xs">Locked</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
