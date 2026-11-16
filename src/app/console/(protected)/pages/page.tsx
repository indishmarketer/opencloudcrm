import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { listPagesWithBuiltIns } from "@/lib/sitePages";
import { BUILT_IN_PATHS } from "@/lib/defaultPages";
import { hasUnpublishedChanges } from "@/lib/sitePagesShape";
import ConsolePages, { type PageRow } from "@/components/ConsolePages";
import ConsolePagesTabs from "@/components/ConsolePagesTabs";
import ConsoleOtherPageSources from "@/components/ConsoleOtherPageSources";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pages | Console" };

async function loadPages() {
  const { pages, untouchedBuiltIns } = await listPagesWithBuiltIns();
  const rows: PageRow[] = [
    ...pages.map((p) => ({
      id: p.id,
      path: p.path || "",
      title: p.path === "/" ? "Home" : p.title,
      status: p.status,
      hasUnpublishedChanges: hasUnpublishedChanges(p),
      builtIn: BUILT_IN_PATHS.has(p.path || ""),
      builtInDefault: false,
      updatedAt: p.updatedAt,
    })),
    // A built-in route nobody has opened yet: shown as "Live" with its
    // code-default content, same as if someone had edited it and
    // published without changing anything -- opening "Edit" is what
    // creates the real row.
    ...untouchedBuiltIns.map((p) => ({
      id: null,
      path: p.path,
      title: p.label,
      status: "published" as const,
      hasUnpublishedChanges: false,
      builtIn: true,
      builtInDefault: true,
      updatedAt: null,
    })),
  ];
  rows.sort((a, b) => (a.path === "/" ? -1 : b.path === "/" ? 1 : a.path.localeCompare(b.path)));
  return rows;
}

export default async function ConsolePagesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!(await getAdminSession())) redirect("/console/login");
  const sp = await searchParams;
  if (sp.tab === "navigation") {
    redirect("/console/site-settings?tab=navigation");
  }

  const rows = await loadPages().catch((error) => {
    console.error("[console pages]", error);
    return null;
  });
  const otherPages = await loadOtherPublicPages().catch(() => []);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl text-ink">Pages</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Every page on the site -- edit its content, publish, take it offline, or delete it. Pages like Courses,
          Webinars, Reviews, Tools directory and Newsletter have their own data (a course list, a review feed...)
          behind them, so their address can&apos;t move, but everything else about them is yours to edit or remove.
        </p>
      </div>
      <ConsolePagesTabs />
      {!rows ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Pages couldn&apos;t be loaded. If you just upgraded, run the database migrations (<code>npm run migrate</code>) and reload.
        </p>
      ) : (
        <ConsolePages rows={rows} />
      )}
      <ConsoleOtherPageSources pages={otherPages} />
    </div>
  );
}

/** Public pages that live outside the page builder, for their contact source. */
async function loadOtherPublicPages() {
  const [meetings, webinars, courses] = await Promise.all([
    pool.query<{ slug: string; name: string }>("SELECT slug, name FROM meeting_types ORDER BY name"),
    pool.query<{ slug: string; title: string }>("SELECT slug, title FROM webinars ORDER BY title"),
    pool.query<{ slug: string; title: string }>("SELECT slug, title FROM courses ORDER BY title"),
  ]);
  return [
    { path: "/signup", title: "Sign up", group: "Account" },
    { path: "/login", title: "Log in", group: "Account" },
    ...meetings.rows.map((m) => ({ path: `/book/${m.slug}`, title: m.name, group: "Meeting booking pages" })),
    ...webinars.rows.map((w) => ({ path: `/webinars/${w.slug}`, title: w.title, group: "Webinar pages" })),
    ...courses.rows.map((c) => ({ path: `/courses/${c.slug}`, title: c.title, group: "Course pages" })),
  ];
}
