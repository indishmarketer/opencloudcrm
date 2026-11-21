"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";

type GuideDocument = {
  id: number;
  title: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  mime_type: string;
  is_active: boolean;
  created_at: string | Date;
};

function fileSize(bytes: number | null): string {
  if (!bytes) return "Size unavailable";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function extension(name: string): string {
  return name.split(".").pop()?.toUpperCase().slice(0, 6) || "FILE";
}

export default function ConsoleGuideDocuments({ documents }: { documents: GuideDocument[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [busy, setBusy] = useState<number | "upload" | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function uploadDocument() {
    if (!file) return;
    setBusy("upload");
    setError("");
    const form = new FormData();
    form.set("file", file);
    form.set("title", title.trim());
    const response = await fetch("/api/console/guide-files", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setError(body.error || "Could not upload that document.");
    setTitle("");
    setFile(null);
    setFileInputKey((value) => value + 1);
    router.refresh();
  }

  async function selectDocument(document: GuideDocument) {
    setBusy(document.id);
    setError("");
    const response = await fetch(`/api/console/guide-files/${document.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setError(body.error || "Could not select that document.");
    router.refresh();
  }

  async function removeDocument(document: GuideDocument) {
    const ok = await confirm({
      message: document.is_active
        ? `Delete "${document.title}" permanently? It is currently used by the homepage popup. The popup will stop offering a download until you select another file.`
        : `Delete "${document.title}" permanently from the document library and R2 storage? This cannot be undone.`,
      confirmLabel: "Delete permanently",
    });
    if (!ok) return;
    setBusy(document.id);
    setError("");
    const response = await fetch(`/api/console/guide-files/${document.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setError(body.error || "Could not delete that document.");
    router.refresh();
  }

  async function copyLink(document: GuideDocument) {
    try {
      await navigator.clipboard.writeText(document.file_url);
      setCopied(document.id);
      window.setTimeout(() => setCopied((current) => current === document.id ? null : current), 1800);
    } catch {
      setError("Could not copy the link. Open the file and copy its address instead.");
    }
  }

  return (
    <div className="space-y-6">
      {dialog}
      <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><Upload className="h-5 w-5" /></span>
          <div>
            <h2 className="font-display text-lg font-semibold">Upload a guide file</h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">PDF, Word, spreadsheet, presentation, text, OpenDocument, or ZIP. Maximum 25 MB.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] md:items-end">
          <label className="block text-sm font-medium">
            Display name
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Indie Automation Starter Guide" className="mt-2 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-accent" />
          </label>
          <label className="block text-sm font-medium">
            Document
            <input key={fileInputKey} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv,.zip" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-2 block w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-xs text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-accent" />
          </label>
          <button type="button" onClick={uploadDocument} disabled={!file || busy !== null} className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-on disabled:opacity-50">
            {busy === "upload" ? "Uploading…" : "Upload file"}
          </button>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-display text-xl font-semibold">Document library</h2><p className="mt-1 text-sm text-ink-soft">Select one file for the homepage popup. Every file also has a direct public link.</p></div>
          <span className="text-xs text-ink-soft">{documents.length} {documents.length === 1 ? "file" : "files"}</span>
        </div>
        <div className="mt-4 space-y-3">
          {documents.map((document) => (
            <article key={document.id} className={`overflow-hidden rounded-2xl border bg-paper ${document.is_active ? "border-accent/45 shadow-[0_16px_45px_-38px_var(--accent)]" : "border-line"}`}>
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${document.is_active ? "bg-accent-soft text-accent" : "bg-paper-soft text-ink-soft"}`}><FileText className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">{document.title}</h3>
                      {document.is_active && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">Homepage popup</span>}
                    </div>
                    <p className="mt-1 break-all text-xs text-ink-soft">{document.file_name}</p>
                    <p className="mt-1 text-xs text-ink-soft">{extension(document.file_name)} · {fileSize(document.file_size)} · Uploaded {new Date(document.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {!document.is_active && <button type="button" onClick={() => selectDocument(document)} disabled={busy !== null} className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-on disabled:opacity-50">Use in popup</button>}
                  <button type="button" onClick={() => copyLink(document)} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-medium hover:border-accent hover:text-accent">{copied === document.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied === document.id ? "Copied" : "Copy link"}</button>
                  <a href={document.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-medium hover:border-accent hover:text-accent"><ExternalLink className="h-3.5 w-3.5" />Open</a>
                  <button type="button" onClick={() => removeDocument(document)} disabled={busy !== null} aria-label={`Delete ${document.title}`} className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                </div>
              </div>
            </article>
          ))}
          {documents.length === 0 && <div className="rounded-2xl border border-dashed border-line p-10 text-center"><FileText className="mx-auto h-7 w-7 text-ink-soft" /><p className="mt-3 font-medium">No guide files yet</p><p className="mt-1 text-sm text-ink-soft">Upload the first document and it will be selected automatically.</p></div>}
        </div>
      </section>
    </div>
  );
}
