import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getPageById } from "@/lib/sitePages";
import SitePageView from "@/components/pageBlocks/SitePageView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

/** Admin-only preview of a page's unpublished working copy. */
export default async function PagePreview({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) redirect("/console/login");
  const page = await getPageById(Number((await params).id));
  if (!page) notFound();
  return (
    <>
      <div className="sticky top-[65px] z-40 bg-amber-100 px-6 py-2 text-center text-sm text-amber-900">
        Preview of unpublished changes. Visitors still see the last published version.
      </div>
      <SitePageView
        page={page}
        builtIn={
          <div className="mx-auto max-w-6xl px-6 py-10">
            <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-soft">
              This page&apos;s own content (its list, form or policy text) appears here.
            </div>
          </div>
        }
      />
    </>
  );
}
