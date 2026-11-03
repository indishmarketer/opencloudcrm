/** Landing page for the emailed console login link. The link only opens
 * this page; the button spends the token, so mail scanners can't. */
export default async function ConsoleLoginConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-2xl font-semibold">Console</h1>
      {token ? (
        <form method="POST" action="/api/console/verify" className="mt-8">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            Sign in to the console
          </button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-red-600">
          This link is missing its token. Request a new one from the console login page.
        </p>
      )}
    </div>
  );
}
