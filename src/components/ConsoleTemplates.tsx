"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

export type ContentTemplateRow = {
  kind: "content";
  id: number;
  name: string;
  subject: string;
  body_html: string;
  category: "marketing" | "transactional";
  folder: string | null;
};

export type FixedTemplateRow = {
  kind: "fixed";
  key: string;
  label: string;
  description: string;
  subject: string;
  body_html: string;
  from_email: string;
  track_opens: boolean;
  allowed_vars: string[];
  /** The fixed templates already ship grouped (courses, meetings,
   * admin, security, account), so their folder is that category. */
  folder: string | null;
};

export type TemplateRow = ContentTemplateRow | FixedTemplateRow;

function rowName(row: TemplateRow): string {
  return row.kind === "content" ? row.name : row.label;
}
function rowKey(row: TemplateRow): string {
  return row.kind === "content" ? `content-${row.id}` : `fixed-${row.key}`;
}
function rowFolder(row: TemplateRow): string {
  return (row.folder || "").trim() || "General";
}

/** Folders in display order: General last, everything else A to Z, so a
 * named group never hides below the ungrouped pile. */
function groupByFolder(rows: TemplateRow[]): [string, TemplateRow[]][] {
  const groups = new Map<string, TemplateRow[]>();
  for (const row of rows) {
    const name = rowFolder(row);
    const bucket = groups.get(name);
    if (bucket) bucket.push(row);
    else groups.set(name, [row]);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === "General" ? 1 : b === "General" ? -1 : a.localeCompare(b),
  );
}

function composerHref(row: TemplateRow): string {
  return row.kind === "content" ? `/console/email-builder/${row.id}` : `/console/email-builder/fixed/${encodeURIComponent(row.key)}`;
}

export default function ConsoleTemplates({
  contentTemplates,
  fixedTemplates,
}: {
  contentTemplates: ContentTemplateRow[];
  fixedTemplates: FixedTemplateRow[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<"marketing" | "transactional">("marketing");
  const [creatingName, setCreatingName] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [moveError, setMoveError] = useState("");

  const rows: TemplateRow[] = useMemo(() => {
    if (tab === "marketing") return contentTemplates.filter((t) => t.category === "marketing");
    return [
      ...contentTemplates.filter((t) => t.category === "transactional"),
      ...fixedTemplates,
    ];
  }, [tab, contentTemplates, fixedTemplates]);

  const groups = useMemo(() => groupByFolder(rows), [rows]);

  const folderChoices = useMemo(() => {
    const names = new Set<string>(["Courses"]);
    for (const t of contentTemplates) if (t.folder?.trim()) names.add(t.folder.trim());
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [contentTemplates]);

  async function moveToFolder(row: ContentTemplateRow, folder: string) {
    setMoveError("");
    const res = await fetch(`/api/console/email/content-templates/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: row.name, subject: row.subject, bodyHtml: row.body_html, folder }),
    });
    if (!res.ok) {
      setMoveError("Could not move that template. Try again.");
      return;
    }
    router.refresh();
  }

  async function createAndOpen() {
    const name = (creatingName || "").trim();
    if (!name) return;
    setCreating(true);
    setCreateError("");
    const res = await fetch("/api/console/email/content-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, subject: "", bodyHtml: "", category: tab }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    setCreating(false);
    if (!res?.ok) {
      setCreateError(body.error || "Could not create this template.");
      return;
    }
    router.push(`/console/email-builder/${body.template.id}`);
  }

  async function handleDelete(row: TemplateRow) {
    const ok = await confirm({ message: `Delete "${rowName(row)}"? This can't be undone.` });
    if (!ok) return;
    setDeletingKey(rowKey(row));
    setDeleteError("");
    const url = row.kind === "content" ? `/api/console/email/content-templates/${row.id}` : `/api/console/email/templates/${encodeURIComponent(row.key)}`;
    const res = await fetch(url, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setDeletingKey(null);
    if (!res.ok) {
      setDeleteError(body.error || "Could not delete this template.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-paper-soft p-0.5" role="tablist" aria-label="Template type">
          <button type="button" role="tab" aria-selected={tab === "marketing"} onClick={() => setTab("marketing")} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === "marketing" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>
            Marketing
          </button>
          <button type="button" role="tab" aria-selected={tab === "transactional"} onClick={() => setTab("transactional")} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === "transactional" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>
            Transactional
          </button>
        </div>
        {creatingName === null && (
          <button type="button" onClick={() => setCreatingName("")} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80">
            New template
          </button>
        )}
      </div>

      {creatingName !== null && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-paper p-4">
          <label className="min-w-48 flex-1">
            <span className="sr-only">Template name</span>
            <input
              autoFocus
              value={creatingName}
              onChange={(e) => setCreatingName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void createAndOpen(); if (e.key === "Escape") setCreatingName(null); }}
              placeholder={tab === "marketing" ? "Name this template (e.g. Spring sale)" : "Name this template (e.g. Signup verification)"}
              maxLength={120}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink"
            />
          </label>
          <button type="button" onClick={() => void createAndOpen()} disabled={creating || !creatingName.trim()} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50">
            {creating ? "Opening…" : "Create and open"}
          </button>
          <button type="button" onClick={() => setCreatingName(null)} className="rounded-full border border-line px-4 py-2 text-sm">Cancel</button>
          {createError && <p className="text-sm text-red-600">{createError}</p>}
        </div>
      )}

      <div className="mt-6">
        {deleteError && <p role="alert" className="mb-3 text-sm text-red-600">{deleteError}</p>}
        {moveError && <p role="alert" className="mb-3 text-sm text-red-600">{moveError}</p>}
        {!rows.length ? (
          <p className="text-sm text-ink-soft">
            {tab === "marketing" ? "No marketing templates yet." : "No transactional templates yet."}
          </p>
        ) : (
          <div className="space-y-8">
            {groups.map(([folderName, folderRows]) => (
            <section key={folderName}>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                {folderName}
                <span className="font-normal normal-case tracking-normal">({folderRows.length})</span>
              </h3>
              <div className="space-y-3">
            {folderRows.map((row) => {
              const k = rowKey(row);
              return (
                <div key={k} className="rounded-2xl border border-line bg-paper p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 text-left">
                      <p className="font-medium">{rowName(row)}</p>
                      <p className="mt-1 text-xs text-ink-soft">{row.subject || "No subject set"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {row.kind === "content" && (
                        <select
                          aria-label={`Folder for ${rowName(row)}`}
                          value={rowFolder(row) === "General" ? "" : rowFolder(row)}
                          onChange={(e) => void moveToFolder(row, e.target.value)}
                          className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink-soft outline-none transition-colors hover:border-ink"
                        >
                          <option value="">General</option>
                          {folderChoices.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      )}
                      <Link href={composerHref(row)} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink">
                        Open composer
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleDelete(row)}
                        disabled={deletingKey === k}
                        className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingKey === k ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
              </div>
            </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
