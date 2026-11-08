"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import RichTextEditor from "@/components/RichTextEditor";
import { useConfirm } from "@/components/ConfirmDialog";
import { emailAt } from "@/lib/liveSiteUrl";

const FROM_ADDRESSES = [
  { value: emailAt("me"), label: `${emailAt("me")} (notifies you)` },
  { value: emailAt("academy"), label: emailAt("academy") },
  { value: emailAt("support"), label: emailAt("support") },
  { value: emailAt("reach"), label: emailAt("reach") },
];

const CATEGORY_LABELS: Record<string, string> = {
  security: "Account & security",
  courses: "Course access",
  "payments-alerts": "Payment alerts (to you)",
  "community-support": "Contact, reviews & support",
  admin: "Admin & authors",
  meetings: "Meetings",
  webinars: "Webinars",
  reviews: "Reviews",
  "open-cloud-crm": "Open Cloud CRM leads",
};

export type EmailTemplateRow = {
  key: string;
  category: string;
  label: string;
  description: string;
  subject: string;
  body_html: string;
  from_email: string;
  critical: boolean;
  track_opens: boolean;
  allowed_vars: string[];
  deletable: boolean;
};

function TemplateEditor({ tpl }: { tpl: EmailTemplateRow }) {
  const [subject, setSubject] = useState(tpl.subject);
  const [bodyHtml, setBodyHtml] = useState(tpl.body_html);
  const [fromEmail, setFromEmail] = useState(tpl.from_email);
  const [trackOpens, setTrackOpens] = useState(tpl.track_opens);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [testTo, setTestTo] = useState("");

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/console/email/templates/${tpl.key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, bodyHtml, fromEmail, trackOpens }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setTestStatus("error");
      setTestMessage(body.error || "Could not save this email.");
      return;
    }
    setDirty(false);
  }

  async function sendTest() {
    setTestStatus("sending");
    const res = await fetch(`/api/console/email/templates/${tpl.key}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, bodyHtml, fromEmail, testTo }),
    });
    const body = await res.json().catch(() => ({}));
    setTestStatus(res.ok ? "sent" : "error");
    setTestMessage(res.ok ? `Sent to ${body.sentTo}` : body.error || "Something went wrong.");
    setTimeout(() => setTestStatus("idle"), 6000);
  }

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-ink-soft">Send from</label>
        <div className="min-w-[220px]">
          <BrandSelect
            value={fromEmail}
            onChange={(v) => {
              setFromEmail(v);
              setDirty(true);
            }}
            options={FROM_ADDRESSES}
            compact
          />
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={trackOpens}
            onChange={(e) => {
              setTrackOpens(e.target.checked);
              setDirty(true);
            }}
            className="rounded border-line accent-ink"
          />
          Track opens
        </label>
      </div>

      <div>
        <label className="text-sm font-medium">Subject</label>
        <input
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setDirty(true);
          }}
          className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Content</label>
        <div className="mt-1">
          <RichTextEditor
            value={bodyHtml}
            onChange={(html) => {
              setBodyHtml(html);
              setDirty(true);
            }}
          />
        </div>
        <p className="mt-1.5 text-xs text-ink-soft">
          Allowed placeholders: {tpl.allowed_vars.length > 0 ? tpl.allowed_vars.map((name) => `{{${name}}}`).join(", ") : "none"}.
          Test sends substitute safe example values so broken copy is visible before saving.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
        </button>
        <input
          type="email"
          value={testTo}
          onChange={(e) => setTestTo(e.target.value)}
          placeholder="Send test to (default: you)"
          aria-label="Send test to"
          className="w-60 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          type="button"
          onClick={sendTest}
          disabled={testStatus === "sending"}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink disabled:opacity-50"
        >
          {testStatus === "sending" ? "Sending test..." : "Send test"}
        </button>
        {(testStatus === "sent" || testStatus === "error") && (
          <p className={`text-xs ${testStatus === "sent" ? "text-emerald-700" : "text-red-600"}`}>{testMessage}</p>
        )}
      </div>
    </div>
  );
}

function sortedCategories(templates: EmailTemplateRow[]): string[] {
  const seen = new Set(templates.map((t) => t.category));
  return [...seen].sort((a, b) => (CATEGORY_LABELS[a] || a).localeCompare(CATEGORY_LABELS[b] || b));
}

export default function ConsoleEmailTemplates({ templates }: { templates: EmailTemplateRow[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(() => sortedCategories(templates)[0] || "");
  const [deleteError, setDeleteError] = useState("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const categoryOptions = useMemo(() => sortedCategories(templates), [templates]);

  useEffect(() => {
    if (categoryOptions.length && !categoryOptions.includes(category)) setCategory(categoryOptions[0]);
    else if (!categoryOptions.length) setCategory("");
  }, [categoryOptions, category]);

  async function removeTemplate(template: EmailTemplateRow) {
    const ok = await confirm({
      message: `Permanently delete “${template.label}” from the transactional email system?`,
      confirmLabel: "Delete email",
    });
    if (!ok) return;
    setDeletingKey(template.key);
    setDeleteError("");
    try {
      const response = await fetch(`/api/console/email/templates/${encodeURIComponent(template.key)}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not delete this email.");
      if (openKey === template.key) setOpenKey(null);
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete this email.");
    } finally {
      setDeletingKey(null);
    }
  }

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of templates) counts.set(t.category, (counts.get(t.category) || 0) + 1);
    return counts;
  }, [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (t.category !== category) return false;
      if (!q) return true;
      return t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.key.toLowerCase().includes(q);
    });
  }, [templates, search, category]);

  return (
    <div>
      {dialog}
      <p className="max-w-2xl text-sm text-ink-soft">
        Every fixed (transactional) email this site can send — {templates.length} in total. Click one to edit its
        subject and content, or send yourself a test copy first.
      </p>

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Email categories">
        {categoryOptions.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            aria-current={category === c ? "page" : undefined}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              category === c ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {CATEGORY_LABELS[c] || c} ({categoryCounts.get(c) || 0})
          </button>
        ))}
      </nav>

      <div className="mt-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, description, or key…"
          className="block w-full max-w-sm rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
        />
      </div>

      {!filtered.length && (
        <p className="mt-8 text-sm text-ink-soft">No emails match these filters.</p>
      )}
      {deleteError && <p role="alert" className="mt-4 text-sm text-red-600">{deleteError}</p>}

      <div className="mt-6 space-y-3">
        {filtered.map((tpl) => {
          const isOpen = openKey === tpl.key;
          return (
            <div key={tpl.key} className="rounded-2xl border border-line bg-paper p-5">
              <button
                type="button"
                onClick={() => setOpenKey(isOpen ? null : tpl.key)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div>
                  <p className="font-medium">{tpl.label}</p>
                  <p className="mt-1 text-xs text-ink-soft">{tpl.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {tpl.critical && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      Critical
                    </span>
                  )}
                  {!tpl.track_opens && (
                    <span className="rounded-full bg-paper-soft px-2.5 py-0.5 text-xs text-ink-soft">
                      Not tracked
                    </span>
                  )}
                  <span className="text-sm text-ink-soft">{isOpen ? "Close" : "Edit"}</span>
                </div>
              </button>
              <div className="mt-3 flex justify-end border-t border-line pt-3">
                {tpl.deletable ? (
                  <button
                    type="button"
                    onClick={() => void removeTemplate(tpl)}
                    disabled={deletingKey === tpl.key}
                    className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingKey === tpl.key ? "Deleting…" : "Delete email"}
                  </button>
                ) : (
                  <p className="text-xs text-ink-soft">Required by a site feature; cannot be deleted.</p>
                )}
              </div>
              {isOpen && <TemplateEditor tpl={tpl} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
