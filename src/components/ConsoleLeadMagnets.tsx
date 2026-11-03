"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConsoleModal from "@/components/ConsoleModal";
import { useConfirm } from "@/components/ConfirmDialog";
import { SITE_HOSTNAME } from "@/config/brand";

type Guide = {
  id: number;
  slug: string;
  title: string;
  headline: string;
  subheadline: string | null;
  cover_image_url: string | null;
  file_url: string | null;
  published: boolean;
};

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

type EditorMode = { kind: "create" } | { kind: "edit"; guide: Guide };

export default function ConsoleLeadMagnets({ guides }: { guides: Guide[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [editor, setEditor] = useState<EditorMode | null>(null);

  async function remove(guide: Guide) {
    const ok = await confirm({
      message: `Delete "${guide.title}"? This removes its cover image and file from storage too. This can't be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const res = await fetch(`/api/console/lead-magnets/${guide.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <div>
      {dialog}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditor({ kind: "create" })}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80"
        >
          New guide
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {guides.map((guide) => (
          <div key={guide.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-paper p-5">
            <div className="flex min-w-0 items-center gap-4">
              {guide.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={guide.cover_image_url} alt="" className="h-14 w-20 shrink-0 rounded-lg border border-line object-cover" />
              ) : (
                <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-xs text-ink-soft">
                  No cover
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">{guide.title}</p>
                <p className="truncate text-xs text-ink-soft">/{guide.slug}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${guide.published ? "bg-ink text-paper" : "bg-paper-soft text-ink-soft"}`}>
                    {guide.published ? "Published" : "Draft"}
                  </span>
                  {!guide.file_url && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">No file uploaded</span>}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setEditor({ kind: "edit", guide })}
                className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => remove(guide)}
                className="rounded-full border border-line px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:border-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {guides.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center">
            <p className="font-medium">No guides yet</p>
          </div>
        )}
      </div>

      {editor && <GuideEditor mode={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}

function GuideEditor({ mode, onClose }: { mode: EditorMode; onClose: () => void }) {
  const router = useRouter();
  const existing = mode.kind === "edit" ? mode.guide : null;
  const [title, setTitle] = useState(existing?.title || "");
  const [slug, setSlug] = useState(existing?.slug || "");
  const [slugTouched, setSlugTouched] = useState(Boolean(existing));
  const [headline, setHeadline] = useState(existing?.headline || "");
  const [subheadline, setSubheadline] = useState(existing?.subheadline || "");
  const [published, setPublished] = useState(existing?.published ?? false);
  const [coverUrl, setCoverUrl] = useState(existing?.cover_image_url || "");
  const [fileUrl, setFileUrl] = useState(existing?.file_url || "");
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const body = { title, slug, headline, subheadline: subheadline || undefined, published };
    const url = mode.kind === "create" ? "/api/console/lead-magnets" : `/api/console/lead-magnets/${mode.guide.id}`;
    const method = mode.kind === "create" ? "POST" : "PATCH";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(data.error || "Could not save that.");
    router.refresh();
    onClose();
  }

  async function uploadCover(file: File) {
    if (mode.kind !== "edit") return;
    setUploadingCover(true);
    setError("");
    const data = new FormData();
    data.set("cover", file);
    const res = await fetch(`/api/console/lead-magnets/${mode.guide.id}/cover`, { method: "POST", body: data });
    const body = await res.json().catch(() => ({}));
    setUploadingCover(false);
    if (!res.ok) return setError(body.error || "Could not upload that image.");
    setCoverUrl(body.url);
    router.refresh();
  }

  async function uploadFile(file: File) {
    if (mode.kind !== "edit") return;
    setUploadingFile(true);
    setError("");
    const data = new FormData();
    data.set("file", file);
    const res = await fetch(`/api/console/lead-magnets/${mode.guide.id}/file`, { method: "POST", body: data });
    const body = await res.json().catch(() => ({}));
    setUploadingFile(false);
    if (!res.ok) return setError(body.error || "Could not upload that file.");
    setFileUrl(body.url);
    router.refresh();
  }

  const field = "mt-2 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink";

  return (
    <ConsoleModal title={mode.kind === "create" ? "New guide" : "Edit guide"} onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Title</label>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            placeholder="The Indie Automation Starter Guide"
            className={field}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Slug</label>
          <input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="indie-automation-starter-guide"
            className={field}
          />
          <p className="mt-1 text-xs text-ink-soft">{SITE_HOSTNAME}/guide/{slug || "..."}</p>
        </div>
        <div>
          <label className="text-sm font-medium">Headline</label>
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="What shows in the popup, above the form"
            className={field}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Subheadline</label>
          <textarea
            value={subheadline}
            onChange={(e) => setSubheadline(e.target.value)}
            rows={2}
            className={`${field} resize-y`}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Published (offered on the homepage once this is the most recently created published guide)
        </label>

        {mode.kind === "edit" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Cover image</label>
              {coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="" className="mt-2 h-24 w-full rounded-lg border border-line object-cover" />
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])}
                disabled={uploadingCover}
                className="mt-2 block w-full text-xs text-ink-soft file:mr-3 file:rounded-full file:border file:border-line file:bg-paper file:px-3 file:py-1.5 file:text-xs file:font-medium"
              />
              {uploadingCover && <p className="mt-1 text-xs text-ink-soft">Uploading…</p>}
            </div>
            <div>
              <label className="text-sm font-medium">Guide file (PDF)</label>
              {fileUrl && (
                <p className="mt-2 truncate text-xs text-ink-soft">
                  <a href={fileUrl} target="_blank" rel="noreferrer" className="underline">Current file</a>
                </p>
              )}
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                disabled={uploadingFile}
                className="mt-2 block w-full text-xs text-ink-soft file:mr-3 file:rounded-full file:border file:border-line file:bg-paper file:px-3 file:py-1.5 file:text-xs file:font-medium"
              />
              {uploadingFile && <p className="mt-1 text-xs text-ink-soft">Uploading…</p>}
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-soft">Save this first, then come back in to upload a cover image and the PDF file.</p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink">
            Close
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !title || !slug || !headline}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ConsoleModal>
  );
}
