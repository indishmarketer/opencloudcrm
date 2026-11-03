"use client";

import { useEffect, useRef, useState } from "react";
import ConsoleModal from "@/components/ConsoleModal";

type MediaItem = { key: string; url: string; size: number; lastModified: string | null };

function basename(key: string): string {
  return key.split("/").pop() || key;
}

/** A trimmed-down browse-and-pick version of the full /console/media page
 * (ConsoleMediaLibrary.tsx), for use inside a field that needs an image URL
 * -- same /api/console/media endpoints, so whatever's uploaded through
 * either one shows up in both. */
export default function MediaLibraryPicker({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) {
  const [folder, setFolder] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load(prefix: string) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (prefix) params.set("prefix", prefix);
    const res = await fetch(`/api/console/media?${params}`).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    setLoading(false);
    if (!res?.ok) {
      setError(body.error || "Could not load the media library.");
      return;
    }
    setItems(body.items || []);
    setFolders(body.folders || []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets the resulting state once the fetch resolves; this just kicks it off
    void load(folder);
  }, [folder]);

  async function upload(file: File) {
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("prefix", folder.replace(/\/$/, "") || "page-images");
    const res = await fetch("/api/console/media", { method: "POST", body: form }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    setUploading(false);
    if (!res?.ok) {
      setError(body.error || "Could not upload that file.");
      return;
    }
    onSelect(body.url);
  }

  return (
    <ConsoleModal title="Media library" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFolder("")}
            className={`rounded-full border border-line px-3 py-1.5 text-sm font-medium ${!folder ? "bg-ink text-paper" : "hover:border-ink"}`}
          >
            Root
          </button>
          {folder
            .split("/")
            .filter(Boolean)
            .map((segment, i, arr) => (
              <button key={i} type="button" onClick={() => setFolder(arr.slice(0, i + 1).join("/") + "/")} className="rounded-full border border-ink bg-ink px-3 py-1.5 text-sm font-medium text-paper">
                {segment}
              </button>
            ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="ml-auto rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload new"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="text-sm text-ink-soft">Loading…</p>
        ) : (
          <>
            {folders.length === 0 && items.length === 0 && <p className="text-sm text-ink-soft">Nothing here yet.</p>}
            {folders.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {folders.map((p) => (
                  <button key={p} type="button" onClick={() => setFolder(p)} className="flex items-center gap-2 rounded-xl border border-line bg-paper p-3 text-left text-sm font-medium hover:border-ink">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
                    </svg>
                    <span className="truncate">{p.split("/").filter(Boolean).pop()}</span>
                  </button>
                ))}
              </div>
            )}
            {items.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onSelect(item.url)}
                    className="overflow-hidden rounded-xl border border-line bg-paper text-left transition-colors hover:border-ink"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary R2 key, no fixed dimensions */}
                    <img src={item.url} alt={basename(item.key)} loading="lazy" className="h-24 w-full object-cover" />
                    <p className="truncate px-2 py-1.5 text-xs font-medium">{basename(item.key)}</p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ConsoleModal>
  );
}
