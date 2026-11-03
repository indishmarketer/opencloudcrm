import { safeRedirectPath } from "@/lib/auth";

export const metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
};

/** Landing page for the emailed verification link. The link only opens
 * this page; the button spends the token, so mail scanners can't. */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; redirect?: string }>;
}) {
  const { token = "", redirect } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-4xl font-semibold">Confirm your email</h1>
      {token ? (
        <form method="POST" action="/api/auth/verify-email" className="mt-10">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="redirect" value={safeRedirectPath(redirect)} />
          <p className="text-sm text-ink-soft">One click and your account is ready.</p>
          <button
            type="submit"
            className="mt-6 w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            Confirm my email
          </button>
        </form>
      ) : (
        <p className="mt-10 text-sm text-red-600">
          This link is missing its token. Use the link from the email we sent you.
        </p>
      )}
    </div>
  );
}
