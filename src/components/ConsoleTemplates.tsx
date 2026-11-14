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
};

export type TemplateRow = ContentTemplateRow | FixedTemplateRow;
export type SystemEmailDef = { key: string; label: string; description: string };

function rowName(row: TemplateRow): string {
  return row.kind === "content" ? row.name : row.label;
}
function rowKey(row: TemplateRow): string {
  return row.kind === "content" ? `content-${row.id}` : `fixed-${row.key}`;
}
function composerHref(row: TemplateRow): string {
  return row.kind === "content" ? `/console/email-builder/${row.id}` : `/console/email-builder/fixed/${encodeURIComponent(row.key)}`;
}

function AddFixedEmail({ missing, onAdded }: { missing: SystemEmailDef[]; onAdded: () => void }) {
  const router = useRouter();
  const [key, setKey] = useState(missing[0]?.key || "");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  if (!missing.length) return null;

  async function add() {
    setAdding(true);
    setError("");
    const res = await fetch("/api/console/email/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const body = await res.json().catch(() => ({}));
    setAdding(false);
    if (!res.ok) {
      setError(body.error || "Could not create this email.");
      return;
    }
    onAdded();
    router.refresh();
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line bg-paper-soft p-4">
      <p className="text-sm text-ink-soft">Bring back a deleted one:</p>
      <select value={key} onChange={(e) => setKey(e.target.value)} className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink">
        {missing.map((def) => <option key={def.key} value={def.key}>{def.label}</option>)}
      </select>
      <button type="button" onClick={add} disabled={adding} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50">
        {adding ? "Creating…" : "Create"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function ConsoleTemplates({
  contentTemplates,
  fixedTemplates,
  systemDefs,
}: {
  contentTemplates: ContentTemplateRow[];
  fixedTemplates: FixedTemplateRow[];
  systemDefs: SystemEmailDef[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<"marketing" | "transactional">("marketing");
  const [creatingName, setCreatingName] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const rows: TemplateRow[] = useMemo(() => {
    if (tab === "marketing") return contentTemplates.filter((t) => t.category === "marketing");
    return [
      ...contentTemplates.filter((t) => t.category === "transactional"),
      ...fixedTemplates,
    ];
  }, [tab, contentTemplates, fixedTemplates]);

  const missingSystemDefs = useMemo(() => {
    const existing = new Set(fixedTemplates.map((t) => t.key));
    return systemDefs.filter((def) => !existing.has(def.key));
  }, [fixedTemplates, systemDefs]);

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
        {tab === "transactional" && <AddFixedEmail missing={missingSystemDefs} onAdded={() => {}} />}
        {deleteError && <p role="alert" className="mb-3 text-sm text-red-600">{deleteError}</p>}
        {!rows.length ? (
          <p className="text-sm text-ink-soft">
            {tab === "marketing" ? "No marketing templates yet." : "No transactional templates yet."}
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const k = rowKey(row);
              return (
                <div key={k} className="rounded-2xl border border-line bg-paper p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 text-left">
                      <p className="font-medium">{rowName(row)}</p>
                      <p className="mt-1 text-xs text-ink-soft">{row.subject || "No subject set"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
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
        )}
      </div>
    </div>
  );
}
