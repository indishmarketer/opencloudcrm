"use client";

import { useEffect, useState } from "react";

type CourseVideoItem = { key: string; courseId: number | null; courseTitle: string | null; size: number; lastModified: string | null };

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function basename(key: string): string {
  return key.split("/").pop() || key;
}

/** Read-only view of the course-videos R2 bucket. Unlike the image Media
 * Library, there's no "Copy URL" here -- this bucket is never public, every
 * lesson video is served through a short-lived signed URL checked against
 * the viewer's enrollment first (src/app/api/account/courses/.../video-url).
 * This exists so an admin can see what's actually stored and preview it,
 * not to hand out a reusable link. */
export default function ConsoleCourseVideoLibrary() {
  const [items, setItems] = useState<CourseVideoItem[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  async function load(reset: boolean) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (!reset && nextToken) params.set("continuationToken", nextToken);
    const res = await fetch(`/api/console/media/courses?${params}`).catch(() => null);
    const body = await res?.json().catch(() => ({})) ?? {};
    setLoading(false);
    if (!res?.ok) {
      setError(body.error || "Could not load course videos.");
      return;
    }
    setItems((prev) => (reset ? body.items : [...prev, ...body.items]));
    setNextToken(body.nextToken || null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets the resulting state itself once the fetch resolves; this just kicks it off
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openPreview(key: string) {
    setPreviewKey(key);
    setPreviewUrl("");
    setPreviewLoading(true);
    const res = await fetch(`/api/console/media/courses?previewKey=${encodeURIComponent(key)}`).catch(() => null);
    const body = await res?.json().catch(() => ({})) ?? {};
    setPreviewLoading(false);
    if (res?.ok) setPreviewUrl(body.url);
    else setError(body.error || "Could not load a preview.");
  }

  const visibleItems = search.trim()
    ? items.filter((item) => `${basename(item.key)} ${item.courseTitle || ""}`.toLowerCase().includes(search.trim().toLowerCase()))
    : items;

  return (
    <div>
      <p className="text-sm text-ink-soft">
        Videos uploaded to course lessons. There&apos;s no public URL here -- every lesson video is served through a
        link that expires in hours and only works for an enrolled student, so there&apos;s nothing to copy and reuse.
        To add or replace a video, use that course&apos;s curriculum editor.
      </p>

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by file name or course"
        className="mt-4 w-full max-w-md rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink"
      />

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {!loading && visibleItems.length === 0 && !error && <p className="mt-6 text-sm text-ink-soft">No course videos uploaded yet.</p>}

      <div className="mt-6 overflow-hidden rounded-xl border border-line">
        {visibleItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => openPreview(item.key)}
            className="flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-paper-soft"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={item.key}>{basename(item.key)}</p>
              <p className="mt-0.5 truncate text-xs text-ink-soft">
                {item.courseTitle || (item.courseId ? `Course #${item.courseId}` : "Unknown course")} &middot; {formatSize(item.size)}
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium text-ink-soft">Preview</span>
          </button>
        ))}
      </div>

      {loading && <p className="mt-6 text-sm text-ink-soft">Loading...</p>}

      {nextToken && !loading && !search && (
        <button type="button" onClick={() => load(false)} className="mx-auto mt-6 block rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">
          Load more
        </button>
      )}

      {previewKey && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 p-4" onClick={() => setPreviewKey(null)}>
          <div className="w-full max-w-2xl rounded-xl bg-paper p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="truncate text-sm font-medium">{basename(previewKey)}</p>
              <button type="button" onClick={() => setPreviewKey(null)} className="rounded p-1 text-xs font-medium text-ink-soft hover:bg-paper-soft">Close</button>
            </div>
            <div className="mt-3">
              {previewLoading && <p className="text-sm text-ink-soft">Loading preview...</p>}
              {previewUrl && <video src={previewUrl} controls className="w-full rounded-lg" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
