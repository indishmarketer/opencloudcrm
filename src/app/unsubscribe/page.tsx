import type { Metadata } from "next";
import { pool } from "@/lib/db";
import { verifyUnsubscribeToken as verifyGlobalToken } from "@/lib/emailUnsubscribe";
import { verifyUnsubscribeToken as verifyLegacyNewsletterToken } from "@/lib/newsletterUnsubscribe";
import { getPublicContactEmail } from "@/lib/businessProfile";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string; error?: string }>;
}) {
  const { token, done, error } = await searchParams;

  if (done) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">You&apos;re unsubscribed</h1>
        <p className="mt-3 text-sm text-ink-soft">
          You won&apos;t get any more emails from us. Sorry to see you go.
        </p>
      </div>
    );
  }

  // Current links use an email-keyed token (works for any email we've ever
  // sent to). Older newsletter emails already delivered before this system
  // existed used a subscriber-id-keyed token -- still honored here so those
  // links don't break.
  const emailFromGlobalToken = token ? await verifyGlobalToken(token) : null;
  const legacySubscriberId =
    !emailFromGlobalToken && token ? await verifyLegacyNewsletterToken(token) : null;

  let email = emailFromGlobalToken;
  if (!email && legacySubscriberId) {
    const result = await pool.query("SELECT email FROM newsletter_subscribers WHERE id = $1", [
      legacySubscriberId,
    ]);
    email = result.rows[0]?.email || null;
  }

  if (!email || error) {
    const contactEmail = await getPublicContactEmail();
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">Link invalid</h1>
        <p className="mt-3 text-sm text-ink-soft">
          This unsubscribe link doesn&apos;t look right. Email{" "}
          <a href={`mailto:${contactEmail}`} className="text-ink underline">
            {contactEmail}
          </a>{" "}
          and we&apos;ll take care of it.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold">Unsubscribe</h1>
      <p className="mt-3 text-sm text-ink-soft">
        Stop sending emails to <strong>{email}</strong>?
      </p>
      <form action="/api/unsubscribe" method="POST" className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
        >
          Confirm unsubscribe
        </button>
      </form>
    </div>
  );
}
