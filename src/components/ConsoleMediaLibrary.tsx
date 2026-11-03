"use client";

import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";

type MediaItem = { key: string; url: string; size: number; lastModified: string | null };
type Mode = "browse" | "flat";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function basename(key: string): string {
  return key.split("/").pop() || key;
}

function dirname(key: string): string {
  return key.includes("/") ? key.slice(0, key.lastIndexOf("/") + 1) : "";
}

export default function ConsoleMediaLibrary() {
  const { confirm, dialog } = useConfirm();
  // Browse mode walks the folder tree one level at a time (folder, below).
  // Flat mode lists everything under a top-level prefix at once, however
  // deep it's nested -- the quick-access tabs next to Root, read from
  // whatever top-level folders actually exist in this bucket, so it
  // adapts to each deployment's own folder names instead of a hardcoded
  // list that would only make sense for this one site.
  const [mode, setMode] = useState<Mode>("browse");
  const [folder, setFolder] = useState(""); // browse mode: "" = root, else ends with "/"
  const [flatPrefix, setFlatPrefix] = useState(""); // flat mode: which top-level folder
  const [rootFolders, setRootFolders] = useState<string[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [deleting, setDeleting] = useState("");
  const [search, setSearch] = useState("");

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAlt, setUploadAlt] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const currentPrefix = mode === "flat" ? flatPrefix : folder;

  async function load(reset: boolean, prefix: string, recursive: boolean) {
    setLoading(true);
    setError("");
    if (reset) { setItems([]); setFolders([]); setNextToken(null); }
    const params = new URLSearchParams();
    if (prefix) params.set("prefix", prefix);
    if (recursive) params.set("recursive", "1");
    if (!reset && nextToken) params.set("continuationToken", nextToken);
    const res = await fetch(`/api/console/media?${params}`).catch(() => null);
    const body = await res?.json().catch(() => ({})) ?? {};
    setLoading(false);
    if (!res?.ok) {
      setError(body.error || "Could not load the media library.");
      return;
    }
    setItems((prev) => (reset ? body.items : [...prev, ...body.items]));
    if (!recursive) {
      setFolders((prev) => (reset ? body.folders || [] : prev));
      if (!prefix) setRootFolders(body.folders || []);
    } else {
      setFolders([]);
    }
    setNextToken(body.nextToken || null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets the resulting state itself once the fetch resolves; this just kicks it off
    void load(true, currentPrefix, mode === "flat");
    setSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, folder, flatPrefix]);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Could not copy. Copy the URL from your browser address bar instead.");
    }
  }

  async function remove(item: MediaItem) {
    const ok = await confirm({
      message: "Delete this file from R2? Make sure nothing on the site still uses it first -- this can't be undone.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setDeleting(item.key);
    const res = await fetch(`/api/console/media?key=${encodeURIComponent(item.key)}`, { method: "DELETE" }).catch(() => null);
    setDeleting("");
    if (!res?.ok) {
      setError("Could not delete that file.");
      return;
    }
    setItems((prev) => prev.filter((i) => i.key !== item.key));
  }

  async function createFolder() {
    const name = newFolderName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
    if (!name) return;
    const res = await fetch("/api/console/media/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: `${folder}${name}/` }),
    }).catch(() => null);
    if (!res?.ok) {
      setError("Could not create that folder.");
      return;
    }
    setNewFolderOpen(false);
    setNewFolderName("");
    void load(true, currentPrefix, mode === "flat");
  }

  async function upload() {
    if (!uploadFile) return;
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("file", uploadFile);
    form.append("prefix", currentPrefix.replace(/\/$/, "") || "uploads");
    form.append("alt", uploadAlt);
    form.append("title", uploadTitle);
    const res = await fetch("/api/console/media", { method: "POST", body: form }).catch(() => null);
    const body = await res?.json().catch(() => ({})) ?? {};
    setUploading(false);
    if (!res?.ok) {
      setError(body.error || "Could not upload that file.");
      return;
    }
    setUploadOpen(false);
    setUploadFile(null);
    setUploadAlt("");
    setUploadTitle("");
    void load(true, currentPrefix, mode === "flat");
  }

  async function openEdit(item: MediaItem) {
    setEditingKey(item.key);
    setEditName(basename(item.key).replace(/\.[^.]+$/, ""));
    setEditAlt("");
    setEditTitle("");
    setEditLoading(true);
    const res = await fetch(`/api/console/media/metadata?key=${encodeURIComponent(item.key)}`).catch(() => null);
    const body = await res?.json().catch(() => ({})) ?? {};
    setEditLoading(false);
    if (res?.ok) {
      setEditAlt(body.alt || "");
      setEditTitle(body.title || "");
    }
  }

  async function saveEdit(item: MediaItem) {
    setEditSaving(true);
    setError("");
    const ext = item.key.includes(".") ? item.key.slice(item.key.lastIndexOf(".")) : "";
    const cleanName = editName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
    // The item's own folder, not the current view's prefix -- in flat
    // mode those aren't the same thing, since flat mode lists items from
    // every nested subfolder under one top-level prefix.
    const newKey = cleanName ? `${dirname(item.key)}${cleanName}${ext}` : item.key;
    const res = await fetch("/api/console/media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: item.key, newKey, alt: editAlt, title: editTitle }),
    }).catch(() => null);
    setEditSaving(false);
    if (!res?.ok) {
      setError("Could not save those changes.");
      return;
    }
    setEditingKey(null);
    void load(true, currentPrefix, mode === "flat");
  }

  const visibleItems = search.trim()
    ? items.filter((item) => basename(item.key).toLowerCase().includes(search.trim().toLowerCase()))
    : items;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => { setMode("browse"); setFolder(""); }}
          className={`rounded-full border border-line px-3 py-1.5 text-sm font-medium ${mode === "browse" && folder === "" ? "bg-ink text-paper" : "hover:border-ink"}`}
        >
          Root
        </button>
        {mode === "browse" &&
          folder
            .split("/")
            .filter(Boolean)
            .map((segment, i, arr) => (
              <button
                key={i}
                type="button"
                onClick={() => setFolder(arr.slice(0, i + 1).join("/") + "/")}
                className={`rounded-full border border-line px-3 py-1.5 text-sm font-medium ${i === arr.length - 1 ? "bg-ink text-paper" : "hover:border-ink"}`}
              >
                {segment}
              </button>
            ))}
        {rootFolders.length > 0 && <span className="mx-1 h-5 w-px bg-line" />}
        {rootFolders.map((prefix) => {
          const name = prefix.split("/").filter(Boolean).pop() || prefix;
          return (
            <button
              key={prefix}
              type="button"
              onClick={() => { setMode("flat"); setFlatPrefix(prefix); }}
              title={`All images under /${prefix}, including subfolders`}
              className={`rounded-full border border-line px-3 py-1.5 text-sm font-medium ${mode === "flat" && flatPrefix === prefix ? "bg-ink text-paper" : "hover:border-ink"}`}
            >
              {name}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={mode === "flat" ? "Search file names" : "Search file names in this folder"}
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink"
        />
        {mode === "browse" && (
          <button type="button" onClick={() => setNewFolderOpen((open) => !open)} className="rounded-lg border border-line px-3 py-2 text-sm font-medium hover:border-ink">
            New folder
          </button>
        )}
        <button type="button" onClick={() => setUploadOpen((open) => !open)} className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:opacity-85">
          Upload
        </button>
      </div>

      {newFolderOpen && mode === "browse" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-paper-soft p-3">
          <input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && createFolder()}
            placeholder="folder-name"
            autoFocus
            className="min-w-0 flex-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-ink"
          />
          <button type="button" onClick={createFolder} className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white">Create</button>
          <button type="button" onClick={() => setNewFolderOpen(false)} className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper-soft">Cancel</button>
        </div>
      )}

      {uploadOpen && (
        <div className="mt-3 rounded-lg border border-line bg-paper-soft p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="block text-xs font-medium text-ink-soft">File</label>
              <button type="button" onClick={() => fileRef.current?.click()} className="mt-1 w-full truncate rounded-md border border-dashed border-line bg-white px-2.5 py-1.5 text-left text-sm hover:border-ink">
                {uploadFile ? uploadFile.name : "Choose an image..."}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
            </div>
            <div className="min-w-0 flex-1">
              <label className="block text-xs font-medium text-ink-soft">Alt text</label>
              <input value={uploadAlt} onChange={(event) => setUploadAlt(event.target.value)} placeholder="Describes the image" className="mt-1 w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-ink" />
            </div>
            <div className="min-w-0 flex-1">
              <label className="block text-xs font-medium text-ink-soft">Title</label>
              <input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="Optional" className="mt-1 w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-ink" />
            </div>
            <button type="button" onClick={upload} disabled={uploading || !uploadFile} className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              {uploading ? "Uploading..." : `Upload to /${currentPrefix || "uploads"}`}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {!loading && folders.length === 0 && visibleItems.length === 0 && !error && <p className="mt-6 text-sm text-ink-soft">Nothing here yet.</p>}

      {mode === "browse" && folders.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {folders.map((p) => (
            <button key={p} type="button" onClick={() => setFolder(p)} className="flex items-center gap-2 rounded-xl border border-line bg-paper p-3 text-left text-sm font-medium hover:border-ink">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /></svg>
              <span className="truncate">{p.split("/").filter(Boolean).pop()}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visibleItems.map((item) => (
          <div key={item.key} className="overflow-hidden rounded-xl border border-line bg-paper">
            {/* Arbitrary R2 keys, not a known-dimension local asset -- next/image needs a fixed size up front. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt={basename(item.key)} loading="lazy" className="h-32 w-full object-cover" />
            <div className="p-2.5">
              <p className="truncate text-xs font-medium" title={item.key}>{basename(item.key)}</p>
              <p className="mt-0.5 truncate text-[11px] text-ink-soft" title={item.key}>{mode === "flat" ? dirname(item.key) || "/" : formatSize(item.size)}</p>
              <div className="mt-2 flex gap-1.5">
                <button type="button" onClick={() => copy(item.url)} className="flex-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium hover:border-ink">
                  {copied === item.url ? "Copied" : "Copy URL"}
                </button>
                <button type="button" onClick={() => openEdit(item)} className="rounded-md border border-line px-2 py-1 text-[11px] font-medium hover:border-ink">
                  Edit
                </button>
                <button type="button" onClick={() => remove(item)} disabled={deleting === item.key} className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-red-600 hover:border-red-600 disabled:opacity-50">
                  {deleting === item.key ? "..." : "Delete"}
                </button>
              </div>
            </div>

            {editingKey === item.key && (
              <div className="border-t border-line bg-paper-soft p-2.5">
                {editLoading ? (
                  <p className="text-xs text-ink-soft">Loading...</p>
                ) : (
                  <div className="space-y-1.5">
                    <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="File name" className="w-full rounded-md border border-line bg-white px-2 py-1 text-xs outline-none focus:border-ink" />
                    <input value={editAlt} onChange={(event) => setEditAlt(event.target.value)} placeholder="Alt text" className="w-full rounded-md border border-line bg-white px-2 py-1 text-xs outline-none focus:border-ink" />
                    <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="Title" className="w-full rounded-md border border-line bg-white px-2 py-1 text-xs outline-none focus:border-ink" />
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => saveEdit(item)} disabled={editSaving} className="flex-1 rounded-md bg-ink px-2 py-1 text-xs font-medium text-white disabled:opacity-50">{editSaving ? "Saving..." : "Save"}</button>
                      <button type="button" onClick={() => setEditingKey(null)} className="rounded-md px-2 py-1 text-xs font-medium text-ink-soft hover:bg-white">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {loading && <p className="mt-6 text-sm text-ink-soft">Loading...</p>}

      {nextToken && !loading && !search && (
        <button type="button" onClick={() => load(false, currentPrefix, mode === "flat")} className="mx-auto mt-6 block rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">
          Load more
        </button>
      )}
      {dialog}
    </div>
  );
}
