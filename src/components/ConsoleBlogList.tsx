"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

type Row = {
  slug: string;
  title: string;
  status: string;
  category: string;
  previewUrl: string | null;
};

const PILL = "rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink";
const PILL_DANGER = "rounded-full border border-line px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-600";

export default function ConsoleBlogList({ posts }: { posts: Row[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [published, setPublished] = useState<{ title: string; url: string } | null>(null);

  async function copy(row: Row) {
    if (!row.previewUrl) return;
    try {
      await navigator.clipboard.writeText(row.previewUrl);
      setCopied(row.slug);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Could not copy. Open the preview and copy its address instead.");
    }
  }

  async function publish(row: Row) {
    const ok = await confirm({
      message: `Publish "${row.title}"? It goes live on the blog, sitemap and search, dated today.`,
      confirmLabel: "Publish",
    });
    if (!ok) return;
    setBusy(row.slug);
    setError("");
    const res = await fetch("/api/console/blog/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: row.slug }),
    }).catch(() => null);
    setBusy("");
    if (!res?.ok) {
      setError("Could not publish this post.");
      return;
    }
    const body = await res.json();
    setPublished({ title: row.title, url: body.url });
    router.refresh();
  }

  async function remove(row: Row) {
    const isPublished = row.status === "published";
    const ok = await confirm({
      message: isPublished
        ? `Delete the published post "${row.title}"? It's a live, search-indexed URL -- this takes it down immediately and removes it from the sitemap. This can't be undone.`
        : `Delete the draft "${row.title}"? This can't be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusy(row.slug);
    setError("");
    const res = await fetch(`/api/console/blog/${row.slug}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmPublishedDelete: isPublished }),
    }).catch(() => null);
    setBusy("");
    if (!res?.ok) {
      const body = await res?.json().catch(() => ({})) ?? {};
      setError(body.error || "Could not delete this post.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {published && (
        <p className="mb-4 rounded-2xl border border-line bg-paper-soft p-4 text-sm">
          Published &quot;{published.title}&quot;.{" "}
          <a href={published.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
            View post
          </a>
        </p>
      )}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {posts.length === 0 ? (
        <p className="text-sm text-ink-soft">No posts yet.</p>
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line bg-paper overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-paper px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-soft">
            <div className="min-w-0 flex-1">Blog post</div>
            <div className="text-right">Actions</div>
          </div>
          {posts.map((row) => {
            const isPublished = row.status === "published";
            return (
              <div key={row.slug} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {row.title}
                  </p>
                  <p className="truncate text-xs text-ink-soft">
                    /blog/{row.slug} · {row.category}
                  </p>
                </div>

                <div className="hidden sm:block sm:w-28">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isPublished ? "bg-green-100 text-green-800" : "bg-paper-soft text-ink-soft"
                    }`}
                  >
                    {isPublished ? "Live" : "Draft"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span
                    className={`sm:hidden rounded-full px-2 py-0.5 text-xs font-medium ${
                      isPublished ? "bg-green-100 text-green-700" : "bg-paper-soft text-ink-soft"
                    }`}
                  >
                    {isPublished ? "Live" : "Draft"}
                  </span>
                  {isPublished && (
                    <a href={`/blog/${row.slug}`} target="_blank" rel="noopener noreferrer" className={PILL}>
                      Open
                    </a>
                  )}
                  {row.previewUrl && (
                    <a href={row.previewUrl} target="_blank" rel="noopener noreferrer" className={PILL}>
                      Preview
                    </a>
                  )}
                  {row.previewUrl && (
                    <button type="button" onClick={() => copy(row)} className={PILL}>
                      {copied === row.slug ? "Copied" : "Copy preview link"}
                    </button>
                  )}
                  <Link href={`/console/blog/edit/${row.slug}`} className={PILL}>
                    Edit
                  </Link>
                  {!isPublished && (
                    <button
                      type="button"
                      onClick={() => publish(row)}
                      disabled={busy === row.slug}
                      className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
                    >
                      {busy === row.slug ? "Publishing..." : "Publish"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(row)}
                    disabled={busy === row.slug}
                    className={`${PILL_DANGER} disabled:opacity-50`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {dialog}
    </div>
  );
}
