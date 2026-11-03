"use client";

import { useEffect, useState } from "react";
import ConsoleModal from "@/components/ConsoleModal";

type VideoItem = { key: string; courseId: number | null; courseTitle: string | null; size: number; lastModified: string | null };

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CourseVideoPicker({
  onSelect,
  onClose,
}: {
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<VideoItem[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(reset: boolean) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (!reset && nextToken) params.set("continuationToken", nextToken);
    const response = await fetch(`/api/console/media/courses?${params}`).catch(() => null);
    const body = await response?.json().catch(() => ({})) ?? {};
    setLoading(false);
    if (!response?.ok) {
      setError(body.error || "Could not load course videos.");
      return;
    }
    setItems((current) => reset ? body.items || [] : [...current, ...(body.items || [])]);
    setNextToken(body.nextToken || null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() resolves the request and sets state asynchronously
    void load(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load lists the shared library once when the picker opens
  }, []);

  return (
    <ConsoleModal title="Choose a video from the media library" onClose={onClose} wide>
      <p className="text-sm text-ink-soft">Select a video already uploaded to the course video library.</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
      {loading && <p className="mt-4 text-sm text-ink-soft">Loading videos…</p>}
      {!loading && !error && items.length === 0 && <p className="mt-4 text-sm text-ink-soft">No videos uploaded for this course yet.</p>}
      <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className="flex w-full items-center justify-between gap-4 rounded-xl border border-line p-3 text-left hover:border-ink hover:bg-paper-soft"
          >
            <span className="min-w-0 truncate text-left">
              <span className="block truncate text-sm font-medium">{item.key.split("/").pop()}</span>
              {item.courseTitle && <span className="block truncate text-xs text-ink-soft">{item.courseTitle}</span>}
            </span>
            <span className="shrink-0 text-xs text-ink-soft">{formatSize(item.size)}</span>
          </button>
        ))}
      </div>
      {nextToken && !loading && (
        <button type="button" onClick={() => void load(false)} className="mt-4 rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">
          Load more
        </button>
      )}
    </ConsoleModal>
  );
}
