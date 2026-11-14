"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RichTextEditor from "@/components/RichTextEditor";
import { useConfirm } from "@/components/ConfirmDialog";
import { TEMPLATE_VARIABLES } from "@/lib/messageVariables";

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

function InlineEditor({ row, siteHost, onSaved }: { row: TemplateRow; siteHost: string; onSaved: () => void }) {
  const [name, setName] = useState(row.kind === "content" ? row.name : "");
  const [subject, setSubject] = useState(row.subject);
  const [bodyHtml, setBodyHtml] = useState(row.body_html);
  const [fromEmail, setFromEmail] = useState(
    row.kind === "fixed" ? (/@example\.com$/i.test(row.from_email) ? `support@${siteHost}` : row.from_email) : ""
  );
  const [trackOpens, setTrackOpens] = useState(row.kind === "fixed" ? row.track_opens : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const url = row.kind === "content"
      ? `/api/console/email/content-templates/${row.id}`
      : `/api/console/email/templates/${encodeURIComponent(row.key)}`;
    const payload = row.kind === "content"
      ? { name, subject, bodyHtml, blocks: null }
      : { subject, bodyHtml, fromEmail, trackOpens, blocks: null };
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error || "Could not save this template.");
      return;
    }
    onSaved();
  }

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      {row.kind === "content" && (
        <div>
          <label className="text-sm font-medium">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <p className="mt-1 text-xs text-ink-soft">For your own reference only — not shown to recipients.</p>
        </div>
      )}
      {row.kind === "fixed" && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-ink-soft" htmlFor={`from-${row.key}`}>Send from</label>
          <input
            id={`from-${row.key}`}
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder={`yourname@${siteHost}`}
            className="min-w-[220px] rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
          />
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={trackOpens} onChange={(e) => setTrackOpens(e.target.checked)} className="rounded border-line accent-ink" />
            Track opens
          </label>
        </div>
      )}
      <div>
        <label className="text-sm font-medium">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Content</label>
        <div className="mt-1">
          <RichTextEditor value={bodyHtml} variables={row.kind === "content" ? TEMPLATE_VARIABLES : undefined} onChange={setBodyHtml} />
        </div>
        {row.kind === "fixed" && row.allowed_vars.length > 0 && (
          <p className="mt-1.5 text-xs text-ink-soft">Allowed placeholders: {row.allowed_vars.map((v) => `{{${v}}}`).join(", ")}</p>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || (row.kind === "content" && !name.trim())}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
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
  siteHost,
}: {
  contentTemplates: ContentTemplateRow[];
  fixedTemplates: FixedTemplateRow[];
  systemDefs: SystemEmailDef[];
  siteHost: string;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<"marketing" | "transactional">("marketing");
  const [openKey, setOpenKey] = useState<string | null>(null);
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
    if (openKey === rowKey(row)) setOpenKey(null);
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
              const isOpen = openKey === k;
              return (
                <div key={k} className="rounded-2xl border border-line bg-paper p-5">
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" onClick={() => setOpenKey(isOpen ? null : k)} className="flex-1 text-left">
                      <p className="font-medium">{rowName(row)}</p>
                      <p className="mt-1 text-xs text-ink-soft">{row.subject || "No subject set"}</p>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link href={composerHref(row)} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink">
                        Open composer
                      </Link>
                      <button type="button" onClick={() => setOpenKey(isOpen ? null : k)} className="text-sm text-ink-soft hover:text-ink">
                        {isOpen ? "Close" : "Edit"}
                      </button>
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
                  {isOpen && (
                    <InlineEditor
                      row={row}
                      siteHost={siteHost}
                      onSaved={() => {
                        setOpenKey(null);
                        router.refresh();
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
