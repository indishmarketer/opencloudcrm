import Link from "next/link";

/** Shown at "/" on a fresh install before the owner has published anything
 * (see src/app/page.tsx / ensureStarterPages in sitePages.ts). Replaces what
 * would otherwise be a blank 404 on a brand-new deployment's homepage. */
export default function NotLiveYet() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold">This site isn&apos;t live yet</h1>
      <p className="mt-3 text-sm text-ink-soft">
        Nothing has been published here yet. If you&apos;re setting up this site, log in to the
        console to choose and publish your first page.
      </p>
      <Link
        href="/console"
        className="mt-6 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
      >
        Go to console
      </Link>
    </div>
  );
}
