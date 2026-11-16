"use client";

import PageSourceField from "@/components/PageSourceField";

/** Contact sources for public pages the page builder doesn't edit:
 * meeting booking pages, webinar pages, course pages, sign-up and log-in.
 * Builder pages set theirs in the page editor's settings, blog posts in the
 * post's settings. */
export default function ConsoleOtherPageSources({ pages }: { pages: { path: string; title: string; group: string }[] }) {
  const groups = Array.from(new Set(pages.map((page) => page.group)));
  return (
    <section className="rounded-2xl border border-line bg-paper p-5">
      <h2 className="font-display text-lg font-semibold">Contact sources for other pages</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Pages that aren&apos;t built in the page editor. Give each a source (up to 3 words) so new contacts who sign up there are labelled in Contacts.
        Pages above set theirs under Edit → Page settings; blog posts in each post&apos;s settings.
      </p>
      {groups.map((group) => (
        <div key={group} className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{group}</p>
          <div className="mt-2 divide-y divide-line">
            {pages.filter((page) => page.group === group).map((page) => (
              <div key={page.path} className="grid items-center gap-2 py-3 sm:grid-cols-[1fr_22rem]">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{page.title}</p><p className="truncate font-mono text-xs text-ink-soft">{page.path}</p></div>
                <PageSourceField path={page.path} compact />
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
