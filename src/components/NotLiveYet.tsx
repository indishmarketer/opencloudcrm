import Link from "next/link";

/** Shown at "/" on a fresh install before the owner has published anything
 * (see src/app/page.tsx / ensureStarterPages in sitePages.ts). Replaces what
 * would otherwise be a blank 404 on a brand-new deployment's homepage.
 *
 * Rendered with no Nav/Footer/banner (see RootLayout's siteIsLive check) --
 * a fresh install should look like an empty site waiting to be set up, not
 * a broken real one with placeholder branding in the chrome around it. */
export default function NotLiveYet() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">This site isn&apos;t live yet.</h1>
      <Link
        href="/console"
        className="mt-6 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
      >
        Go to console
      </Link>
      <p className="mt-8 max-w-sm text-sm text-ink-soft">
        Haven&apos;t set your admin email yet? Set the <code>ADMIN_EMAIL</code> environment variable and
        redeploy first, then log in to the console.
      </p>
    </div>
  );
}
