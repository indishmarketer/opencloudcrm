import { pool } from "@/lib/db";
import { recordContactActivity } from "@/lib/contacts";

/** Interest in a course, short of buying it.
 *
 * Two moments are worth knowing about: someone looked at the course page,
 * and someone got as far as opening checkout and then did not pay. Both
 * are recorded as contact activities, so they show on the contact's
 * timeline and can be segmented on, without a second tracking system.
 *
 * Deliberately only for people we can already name. An anonymous visitor
 * stays anonymous: there is no fingerprinting here, and nothing is
 * written for a visitor with no session and no email token.
 *
 * recordContactActivity is idempotent on (source, source_record_id,
 * activity_type), so the key is one row per person per course. Somebody
 * reading the page five times updates the timestamp instead of filling
 * their timeline with noise.
 */

const SOURCE = "course_interest";

async function emailForGuideToken(token: string): Promise<string | null> {
  if (!token || token.length > 128) return null;
  const result = await pool.query<{ email: string }>(
    "SELECT email FROM guide_requests WHERE token = $1 LIMIT 1",
    [token],
  );
  return result.rows[0]?.email ?? null;
}

/** Someone with a known identity opened a course page.
 *
 * `guideToken` is the token carried by links in the guide emails, which
 * is how a reader who has never signed in is still recognised: they came
 * from an email we sent to a specific address. */
export async function recordCourseView(input: {
  courseId: number;
  courseSlug: string;
  courseTitle: string;
  email?: string | null;
  userId?: number | null;
  guideToken?: string | null;
}): Promise<void> {
  const email = input.email || (input.guideToken ? await emailForGuideToken(input.guideToken) : null);
  if (!email) return;

  await recordContactActivity({
    email,
    userId: input.userId ?? null,
    activityType: "course_viewed",
    source: SOURCE,
    sourceRecordId: `view:${input.courseId}:${email.toLowerCase()}`,
    metadata: {
      course_id: input.courseId,
      course_slug: input.courseSlug,
      course_title: input.courseTitle,
      via: input.email ? "session" : "guide_email",
    },
  });
}

/** Someone opened checkout for a course. Paired with the enrollment that
 * may or may not follow, this is what makes "started paying and stopped"
 * answerable at all. */
export async function recordCheckoutStarted(input: {
  courseId: number;
  courseSlug: string;
  courseTitle: string;
  email: string;
  userId: number;
  method: "razorpay" | "paypal";
  amount: number | null;
  currency: string | null;
}): Promise<void> {
  if (!input.email) return;
  await recordContactActivity({
    email: input.email,
    userId: input.userId,
    activityType: "checkout_started",
    source: SOURCE,
    sourceRecordId: `checkout:${input.courseId}:${input.userId}`,
    metadata: {
      course_id: input.courseId,
      course_slug: input.courseSlug,
      course_title: input.courseTitle,
      method: input.method,
      amount: input.amount,
      currency: input.currency,
    },
  });
}
