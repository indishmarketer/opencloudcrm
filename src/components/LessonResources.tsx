"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";

export type LessonResourceType = "button" | "link" | "pdf" | "text";

export type Resource = {
  id: number;
  lesson_id?: number;
  label: string;
  url?: string | null;
  type?: LessonResourceType;
  content?: string | null;
  icon?: string | null;
  position?: number;
};

function renderResourceIcon(iconKey?: string | null) {
  switch (iconKey) {
    case "server":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
          <line x1="6" y1="6" x2="6.01" y2="6" />
          <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
      );
    case "cloud":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
      );
    case "code":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case "book":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "rocket":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 9V4s3.03.55 4 2c1.08 1.62 0 5 0 5" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
  }
}

function getHostname(url?: string | null): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export default function LessonResources({
  courseId,
  lessonId,
  resources,
  canManage,
}: {
  courseId?: number;
  lessonId: number;
  resources: Resource[];
  canManage: boolean;
}) {
  const [list, setList] = useState<Resource[]>(resources);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form states
  const [formType, setFormType] = useState<LessonResourceType>("button");
  const [formLabel, setFormLabel] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formIcon, setFormIcon] = useState("server");
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { confirm, dialog } = useConfirm();

  if (list.length === 0 && !canManage) return null;

  const buttons = list.filter((r) => r.type === "button" || r.type === "link" || (!r.type && !!r.url));
  const pdfs = list.filter((r) => r.type === "pdf");
  const notes = list.filter((r) => r.type === "text" || (!r.url && !!r.content));

  function openAddModal() {
    setEditingId(null);
    setFormType("button");
    setFormLabel("");
    setFormUrl("");
    setFormContent("");
    setFormIcon("server");
    setFormError("");
    setIsEditorOpen(true);
  }

  function startEdit(r: Resource) {
    setEditingId(r.id);
    setFormType(r.type || (r.content && !r.url ? "text" : "button"));
    setFormLabel(r.label || "");
    setFormUrl(r.url || "");
    setFormContent(r.content || "");
    setFormIcon(r.icon || "server");
    setFormError("");
    setIsEditorOpen(true);
  }

  function closeEditor() {
    setIsEditorOpen(false);
    setEditingId(null);
    setFormError("");
  }

  async function handleFileUpload(file: File) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setFormError("File size must be under 50MB.");
      return;
    }
    setUploadingPdf(true);
    setFormError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const endpoint = courseId
        ? `/api/console/courses/${courseId}/resources/upload`
        : `/api/console/courses/1/resources/upload`;
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to upload document.");
      } else {
        setFormUrl(data.url);
        if (!formLabel.trim()) {
          setFormLabel(file.name.replace(/\.[^/.]+$/, ""));
        }
      }
    } catch {
      setFormError("Upload request failed.");
    } finally {
      setUploadingPdf(false);
    }
  }

  async function handleSave() {
    if (formType !== "text" && !formLabel.trim()) {
      setFormError("Label is required.");
      return;
    }
    if (formType !== "text" && !formUrl.trim()) {
      setFormError("URL is required.");
      return;
    }
    if (formType === "text" && !formLabel.trim() && !formContent.trim()) {
      setFormError("Label or content is required.");
      return;
    }

    setBusy(true);
    setFormError("");

    const payload = {
      label: formLabel.trim() || (formType === "text" ? "Note" : "Resource"),
      url: formType !== "text" ? formUrl.trim() : null,
      type: formType,
      content: formType === "text" ? formContent.trim() : null,
      icon: formType === "button" ? formIcon : null,
    };

    try {
      if (editingId) {
        const res = await fetch(`/api/console/lessons/resources/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error || "Failed to update resource.");
          setBusy(false);
          return;
        }
        setList((prev) => prev.map((r) => (r.id === editingId ? { ...r, ...payload, id: editingId } : r)));
      } else {
        const res = await fetch(`/api/console/lessons/${lessonId}/resources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error || "Failed to create resource.");
          setBusy(false);
          return;
        }
        setList((prev) => [...prev, data.resource]);
      }
      closeEditor();
    } catch {
      setFormError("Failed to save resource.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    const ok = await confirm({ message: "Remove this resource? This cannot be undone." });
    if (!ok) return;
    setBusy(true);
    try {
      await fetch(`/api/console/lessons/resources/${id}`, { method: "DELETE" });
      setList((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusy(false);
    }
  }

  function copyText(id: number, text: string) {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Admin header bar if managing */}
      {canManage && (
        <div className="flex items-center justify-between rounded-xl border border-line bg-paper-soft px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-purple-600" />
            <span className="text-xs font-medium text-ink-soft">Course Resources Manager</span>
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper hover:opacity-85 transition-opacity"
          >
            + Add Resource
          </button>
        </div>
      )}

      {/* 1. Action Buttons */}
      {buttons.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Lesson Links & Actions
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {buttons.map((b) => (
              <div key={b.id} className="relative group">
                <a
                  href={b.url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 p-4 text-white shadow-md shadow-purple-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-purple-900/25 active:translate-y-0"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur-sm transition-transform duration-200 group-hover:scale-105">
                      {renderResourceIcon(b.icon)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-base text-white tracking-tight">
                        {b.label}
                      </div>
                      <div className="text-xs text-purple-200/80 truncate">
                        {getHostname(b.url) || "Click to open link"}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-center rounded-full bg-white/20 p-2 text-white transition-all duration-200 group-hover:bg-white group-hover:text-purple-900 group-hover:translate-x-0.5">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                </a>
                {canManage && (
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 rounded-md p-0.5 backdrop-blur-xs">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        startEdit(b);
                      }}
                      className="px-2 py-0.5 text-[11px] font-medium text-white hover:text-purple-200"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        remove(b.id);
                      }}
                      className="px-2 py-0.5 text-[11px] font-medium text-red-300 hover:text-red-100"
                    >
                      Del
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Downloadable Documents */}
      {pdfs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Downloads & Documents
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {pdfs.map((p) => (
              <div
                key={p.id}
                className="group relative flex items-center justify-between gap-4 rounded-xl border border-line bg-paper p-4 transition-all hover:border-ink/40 hover:shadow-xs"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 border border-red-100">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="10 9 9 9 8 9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-ink truncate">{p.label}</div>
                    <div className="text-xs text-ink-soft">Downloadable Document</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-paper-soft border border-line px-3.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-ink hover:text-paper"
                    >
                      <span>Download</span>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    </a>
                  )}
                  {canManage && (
                    <div className="flex gap-1 ml-2">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="p-1 text-xs text-ink-soft hover:text-ink"
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        className="p-1 text-xs text-red-500 hover:text-red-700"
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Notes & Snippets */}
      {notes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Lesson Notes & Reference
          </h3>
          <div className="space-y-3">
            {notes.map((n) => (
              <div key={n.id} className="rounded-xl border border-line bg-paper overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5 bg-paper-soft">
                  <span className="font-semibold text-xs text-ink flex items-center gap-1.5">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-soft" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {n.label || "Reference Note"}
                  </span>
                  <div className="flex items-center gap-2">
                    {n.content && (
                      <button
                        type="button"
                        onClick={() => copyText(n.id, n.content || "")}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-soft hover:text-ink px-2.5 py-1 rounded-md border border-line bg-paper transition-colors"
                      >
                        {copiedId === n.id ? (
                          <>
                            <svg className="h-3 w-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            <span className="text-green-600 font-semibold">Copied</span>
                          </>
                        ) : (
                          <>
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                    {canManage && (
                      <div className="flex gap-1 ml-1">
                        <button
                          type="button"
                          onClick={() => startEdit(n)}
                          className="p-1 text-xs text-ink-soft hover:text-ink"
                          title="Edit"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(n.id)}
                          className="p-1 text-xs text-red-500 hover:text-red-700"
                          title="Delete"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {n.content && (
                  <div className="p-4 text-xs font-mono whitespace-pre-wrap text-ink bg-paper leading-relaxed selection:bg-purple-100 overflow-x-auto">
                    {n.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inline Modal for Admin Management */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-line bg-paper p-6 shadow-xl">
            <h3 className="text-base font-semibold text-ink">
              {editingId ? "Edit Resource" : "Add Lesson Resource"}
            </h3>

            {/* Type selector tabs */}
            <div className="mt-4 flex rounded-xl border border-line bg-paper-soft p-1">
              <button
                type="button"
                onClick={() => setFormType("button")}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  formType === "button" ? "bg-paper text-ink shadow-xs" : "text-ink-soft hover:text-ink"
                }`}
              >
                Action Button
              </button>
              <button
                type="button"
                onClick={() => setFormType("pdf")}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  formType === "pdf" ? "bg-paper text-ink shadow-xs" : "text-ink-soft hover:text-ink"
                }`}
              >
                PDF Document
              </button>
              <button
                type="button"
                onClick={() => setFormType("text")}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  formType === "text" ? "bg-paper text-ink shadow-xs" : "text-ink-soft hover:text-ink"
                }`}
              >
                Guide Note
              </button>
            </div>

            <div className="mt-4 space-y-3.5">
              <div>
                <label className="text-xs font-medium text-ink-soft">
                  {formType === "text" ? "Title / Heading (optional)" : "Button / Resource Label"}
                </label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder={
                    formType === "button"
                      ? "e.g. Get Vultr VPS"
                      : formType === "pdf"
                      ? "e.g. Setup Guide (PDF)"
                      : "e.g. Recommended VPS Specs"
                  }
                  className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>

              {formType === "button" && (
                <>
                  <div>
                    <label className="text-xs font-medium text-ink-soft">Destination URL</label>
                    <input
                      type="text"
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                      placeholder="https://www.vultr.com"
                      className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink-soft">Button Icon</label>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {[
                        { key: "server", label: "Server" },
                        { key: "link", label: "Link" },
                        { key: "cloud", label: "Cloud" },
                        { key: "code", label: "Code" },
                        { key: "book", label: "Book" },
                        { key: "rocket", label: "Rocket" },
                      ].map((ic) => (
                        <button
                          key={ic.key}
                          type="button"
                          onClick={() => setFormIcon(ic.key)}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                            formIcon === ic.key
                              ? "border-purple-600 bg-purple-50 text-purple-700 font-semibold"
                              : "border-line bg-paper text-ink-soft hover:border-ink"
                          }`}
                        >
                          {renderResourceIcon(ic.key)}
                          <span>{ic.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {formType === "pdf" && (
                <>
                  <div className="rounded-xl border border-line bg-paper-soft p-3">
                    <label className="text-xs font-medium text-ink-soft block mb-1.5">
                      Upload Document to R2
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.zip,.tar.gz"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      className="text-xs w-full file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1.5 file:font-medium file:text-paper hover:file:opacity-85"
                    />
                    {uploadingPdf && (
                      <p className="mt-2 text-xs text-purple-600 font-medium">Uploading to R2 storage...</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink-soft">Document URL</label>
                    <input
                      type="text"
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                      placeholder="https://images.indishmarketer.com/..."
                      className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                    />
                  </div>
                </>
              )}

              {formType === "text" && (
                <div>
                  <label className="text-xs font-medium text-ink-soft">Content / Commands / Notes</label>
                  <textarea
                    rows={6}
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="Enter commands, instructions, or specs here..."
                    className="mt-1 w-full rounded-lg border border-line bg-paper p-3 text-xs font-mono outline-none focus:border-ink"
                  />
                </div>
              )}

              {formError && <p className="text-xs text-red-600">{formError}</p>}
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink hover:border-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || uploadingPdf}
                className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-85 disabled:opacity-50"
              >
                {busy ? "Saving..." : "Save Resource"}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog}
    </div>
  );
}
