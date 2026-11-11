import type { Metadata } from "next";
import { peekOtpToken } from "@/lib/otp";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
};

const PURPOSE_COPY: Record<string, { heading: string; body: string; button: string }> = {
  newsletter: {
    heading: "Confirm your subscription",
    body: "One click and you're on the list.",
    button: "Confirm subscription",
  },
  contact: {
    heading: "Confirm your message",
    body: "One click and we'll get your message.",
    button: "Confirm and send",
  },
  guide: {
    heading: "Confirm your email",
    body: "One click and we'll take you straight to your download.",
    button: "Confirm and get my guide",
  },
  /** Every saved form with email verification on uses the purpose
   * `form-submit-<id>`, so its copy is matched by prefix below rather than
   * by an exact key. */
  form: {
    heading: "Confirm your submission",
    body: "One click and your answers are in.",
    button: "Confirm and submit",
  },
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string; purpose?: string; error?: string }>;
}) {
  const { token, done, purpose, error } = await searchParams;

  if (done) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">You&apos;re confirmed</h1>
        <p className="mt-3 text-sm text-ink-soft">
          {purpose === "newsletter"
            ? "You're on the list. Check your inbox for the next issue."
            : purpose === "contact"
              ? "Your message is on its way to us. We'll get back to you shortly."
              : purpose === "form"
                ? "Your submission has been recorded. Thanks!"
                : "All done."}
        </p>
      </div>
    );
  }

  const peeked = token ? await peekOtpToken(token) : null;

  if (!peeked || error) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">Link invalid or expired</h1>
        <p className="mt-3 text-sm text-ink-soft">
          This confirmation link has already been used or has expired. Head back to the page
          you started on and enter the 6-digit code from the email instead, or request a new
          link.
        </p>
      </div>
    );
  }

  const copyKey = peeked.purpose.startsWith("form-submit-") ? "form" : peeked.purpose;
  const copy = PURPOSE_COPY[copyKey] || {
    heading: "Confirm your email",
    body: "One click and you're done.",
    button: "Confirm",
  };

  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold">{copy.heading}</h1>
      <p className="mt-3 text-sm text-ink-soft">{copy.body}</p>
      <p className="mt-1 text-sm text-ink-soft">
        Confirming <strong>{peeked.email}</strong>
      </p>
      <form action="/api/verify-link" method="POST" className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
        >
          {copy.button}
        </button>
      </form>
    </div>
  );
}
