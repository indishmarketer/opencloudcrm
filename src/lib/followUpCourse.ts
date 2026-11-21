import { getCourseBySlug } from "@/lib/courses";

/** The course offered as the next step after the free guide.
 *
 * Hardcoded on purpose. This is one specific funnel, not a feature: the
 * guide leads to this course, and when that changes it changes here, in
 * a commit, rather than through a settings screen nobody else will ever
 * use.
 */
export const FOLLOW_UP_COURSE_SLUG = "build-your-own-system";

export type FollowUpCourse = {
  slug: string;
  title: string;
  subtitle: string | null;
  url: string;
  /** The owner's headline price, e.g. "$9". Checkout still shows the
   * local amount, since Razorpay charges converted rupees in India. */
  priceLabel: string | null;
};

/** The course, or null when it is not ready to be sold yet. Everything
 * that advertises it goes through here, so an unpublished course can
 * never be linked from the popup, the guide email or a follow-up: those
 * links would 404, which is a worse first impression than no offer. */
export async function getFollowUpCourse(): Promise<FollowUpCourse | null> {
  const course = await getCourseBySlug(FOLLOW_UP_COURSE_SLUG).catch(() => null);
  if (!course || !course.published) return null;

  const amount = course.price;
  const priceLabel =
    amount == null ? null : course.price_currency === "USD" ? `$${amount}` : `₹${amount}`;

  return {
    slug: course.slug,
    title: course.title,
    subtitle: course.subtitle,
    url: `/courses/${course.slug}`,
    priceLabel,
  };
}
