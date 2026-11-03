import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { listPagesWithBuiltIns } from "@/lib/sitePages";
import { BUILT_IN_PATHS } from "@/lib/defaultPages";
import { hasUnpublishedChanges } from "@/lib/sitePagesShape";
import ConsolePages, { type PageRow } from "@/components/ConsolePages";

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
  const tab = sp.tab === "builtin" ? "builtin" : "custom";

  const rows = await loadPages().catch((error) => {
    console.error("[console pages]", error);
    return null;
  });

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl text-ink">Pages</h1>
        <div className="mt-6 flex flex-wrap gap-1 border-b border-line text-sm" role="tablist">
          <Link
            href="/console/pages"
            role="tab"
            aria-selected={tab === "custom"}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 font-medium transition-colors ${
              tab === "custom" ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            Your pages
          </Link>
          <Link
            href="/console/pages?tab=builtin"
            role="tab"
            aria-selected={tab === "builtin"}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 font-medium transition-colors ${
              tab === "builtin" ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            Built-in pages
          </Link>
        </div>
      </div>
      {!rows ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Pages couldn&apos;t be loaded. If you just upgraded, run the database migrations (<code>npm run migrate</code>) and reload.
        </p>
      ) : (
        <ConsolePages key={tab} rows={rows} activeTab={tab} />
      )}
    </div>
  );
}
