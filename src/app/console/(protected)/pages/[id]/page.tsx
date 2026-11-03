import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getPageById } from "@/lib/sitePages";
import { BUILT_IN_PATHS } from "@/lib/defaultPages";
import { hasUnpublishedChanges } from "@/lib/sitePagesShape";
import { getPageLinkOptions } from "@/lib/pageLinkOptions";
import { pool } from "@/lib/db";
import { getPageEditorLiveData } from "@/lib/pageEditorLiveData";
import ConsolePageEditor from "@/components/ConsolePageEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit page | Console" };

export default async function ConsoleEditPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) redirect("/console/login");
  const page = await getPageById(Number((await params).id));
  if (!page) notFound();

  let backHref = "/console/pages";
  let backLabel = "All pages";
  let publicUrl: string | null = page.path;
  if (page.kind === "course") {
    const course = await pool.query<{ slug: string }>("SELECT slug FROM courses WHERE id::text = $1", [page.refId]);
    backHref = `/console/courses/${page.refId}`;
    backLabel = "Back to course";
    publicUrl = course.rows[0] ? `/courses/${course.rows[0].slug}` : null;
  } else if (page.kind === "tool") {
    const tool = await pool.query<{ slug: string; category: string }>(
      "SELECT t.slug, c.slug AS category FROM directory_tools t JOIN directory_categories c ON c.id = t.category_id WHERE t.id::text = $1",
      [page.refId]
    );
    backHref = "/console/directory";
    backLabel = "Back to tools directory";
    publicUrl = tool.rows[0] ? `/tools/${tool.rows[0].category}/${tool.rows[0].slug}` : null;
  }

  return (
    <ConsolePageEditor
      initialPage={{
        ...page,
        builtIn: page.kind === "page" && BUILT_IN_PATHS.has(page.path || ""),
        hasUnpublishedChanges: hasUnpublishedChanges(page),
      }}
      linkOptions={await getPageLinkOptions()}
      backHref={backHref}
      backLabel={backLabel}
      publicUrl={publicUrl}
      liveData={await getPageEditorLiveData()}
    />
  );
}
