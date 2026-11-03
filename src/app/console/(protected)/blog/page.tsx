import Link from "next/link";
import { blogPreviewUrl, getAllPostsIncludingDrafts } from "@/lib/blogPosts";
import ConsoleBlogList from "@/components/ConsoleBlogList";

export const dynamic = "force-dynamic";

const PAGE_SIZES = [10, 20, 30, 100];
const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
] as const;

function buildHref(params: { status: string; pageSize: number; page?: number }): string {
  const search = new URLSearchParams();
  if (params.status !== "all") search.set("status", params.status);
  if (params.pageSize !== 20) search.set("pageSize", String(params.pageSize));
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/console/blog?${query}` : "/console/blog";
}

export default async function ConsoleBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; pageSize?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status === "draft" || sp.status === "published" ? sp.status : "all";
  const pageSize = PAGE_SIZES.includes(Number(sp.pageSize)) ? Number(sp.pageSize) : 20;

  const posts = await getAllPostsIncludingDrafts();
  const counts = {
    all: posts.length,
    draft: posts.filter((p) => (p.status || "published") === "draft").length,
    published: posts.filter((p) => (p.status || "published") === "published").length,
  };
  const filtered = status === "all" ? posts : posts.filter((p) => (p.status || "published") === status);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const rows = pageRows.map((post) => ({
    slug: post.slug,
    title: post.title,
    status: post.status || "published",
    category: post.category,
    previewUrl: post.status === "draft" ? blogPreviewUrl(post.slug, "draft") : null,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full border border-line bg-paper p-1 text-sm">
          {STATUS_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={buildHref({ status: tab.value, pageSize })}
              className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
                status === tab.value ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}
            >
              {tab.label} ({counts[tab.value as keyof typeof counts]})
            </Link>
          ))}
        </div>
        <Link
          href="/console/blog/new"
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80"
        >
          New post
        </Link>
      </div>
      <div className="mt-6">
        <ConsoleBlogList posts={rows} />
      </div>

      {filtered.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
          <div className="flex items-center gap-2">
            <span>Show</span>
            {PAGE_SIZES.map((size) => (
              <Link
                key={size}
                href={buildHref({ status, pageSize: size })}
                className={`rounded-md px-2 py-1 font-medium ${pageSize === size ? "bg-paper-soft text-ink" : "hover:text-ink"}`}
              >
                {size}
              </Link>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-3">
              {page > 1 ? (
                <Link href={buildHref({ status, pageSize, page: page - 1 })} className="font-medium hover:text-ink">
                  Previous
                </Link>
              ) : (
                <span className="opacity-40">Previous</span>
              )}
              <span>
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={buildHref({ status, pageSize, page: page + 1 })} className="font-medium hover:text-ink">
                  Next
                </Link>
              ) : (
                <span className="opacity-40">Next</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
