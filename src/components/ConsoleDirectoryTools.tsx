"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SafeImage from "@/components/SafeImage";
import BrandSelect from "@/components/BrandSelect";
import { useConfirm } from "@/components/ConfirmDialog";
import ConsoleDirectoryReview from "@/components/ConsoleDirectoryReview";
import { PRICING_OPTIONS, STATUS_LABELS, TOOL_STATUSES } from "@/lib/directoryFields";

type Category = { id: number; slug: string; name: string };

type Tool = {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category_id: number;
  category_name: string;
  subcategory: string | null;
  pricing_type: string;
  website_url: string;
  logo_url: string | null;
  screenshots: string[];
  screenshot_alts: Record<string, string>;
  featured: boolean;
  status: string;
  source: string;
  submitted_by_email: string | null;
  review_note: string | null;
  approved_email_sent_at: string | null;
  pending_edits: number;
  listing_tier: "free" | "paid";
  paid_at: string | null;
  backlink_verified_at: string | null;
  backlink_checked_at: string | null;
  backlink_error: string | null;
};

const STATUS_OPTIONS = TOOL_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }));

const FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Waiting for review" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "published", label: "Live" },
  { value: "rejected", label: "Not accepted" },
  { value: "draft", label: "Draft" },
];

const emptyForm = {
  name: "",
  tagline: "",
  description: "",
  category_id: "",
  subcategory: "",
  pricing_type: "free",
  website_url: "",
  logo_url: "",
  featured: false,
  status: "draft",
};

export default function ConsoleDirectoryTools() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [alts, setAlts] = useState<Record<string, string>>({});
  const [domain, setDomain] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirm();
  const mountedRef = useRef(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [listMessage, setListMessage] = useState("");
  const [listBusy, setListBusy] = useState("");

  async function load() {
    const [toolsRes, categoriesRes] = await Promise.all([
      fetch("/api/console/directory/tools"),
      fetch("/api/console/directory/categories"),
    ]);
    const toolsBody = await toolsRes.json();
    const categoriesBody = await categoriesRes.json();
    if (!mountedRef.current) return;
    setTools(toolsBody.tools || []);
    setCategories(categoriesBody.categories || []);
  }

  useEffect(() => {
    load();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setScreenshots([]);
    setAlts({});
    setDomain("");
    setLogoError("");
  }

  function startEdit(t: Tool) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      tagline: t.tagline || "",
      description: t.description || "",
      category_id: String(t.category_id),
      subcategory: t.subcategory || "",
      pricing_type: t.pricing_type,
      website_url: t.website_url,
      logo_url: t.logo_url || "",
      featured: t.featured,
      status: t.status,
    });
    setScreenshots(t.screenshots || []);
    setAlts(t.screenshot_alts || {});
    setLogoError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function fetchLogo() {
    if (!domain) return;
    setLogoBusy(true);
    setLogoError("");
    const res = await fetch("/api/console/directory/fetch-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    const body = await res.json();
    if (!res.ok) {
      setLogoError(body.error || "Couldn't fetch a logo for that domain.");
    } else {
      setForm((f) => ({ ...f, logo_url: body.url }));
    }
    setLogoBusy(false);
  }

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    setLogoError("");
    const data = new FormData();
    data.append("file", file);
    const res = await fetch("/api/console/directory/upload", { method: "POST", body: data });
    const body = await res.json();
    if (!res.ok) {
      setLogoError(body.error || "Upload failed.");
    } else {
      setForm((f) => ({ ...f, logo_url: body.url }));
    }
    setLogoBusy(false);
  }

  async function uploadScreenshot(file: File) {
    setLogoBusy(true);
    const data = new FormData();
    data.append("file", file);
    const res = await fetch("/api/console/directory/upload", { method: "POST", body: data });
    const body = await res.json();
    if (res.ok) setScreenshots((s) => [...s, body.url]);
    setLogoBusy(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      ...form,
      category_id: Number(form.category_id),
      screenshots,
      screenshot_alts: alts,
    };

    const res = await fetch(
      editingId ? `/api/console/directory/tools/${editingId}` : "/api/console/directory/tools",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Something went wrong.");
    } else {
      resetForm();
      load();
    }
    setSaving(false);
  }

  async function handleDelete(t: Tool) {
    const ok = await confirm({ message: `Delete "${t.name}" from the directory? This can't be undone.` });
    if (!ok) return;
    await fetch(`/api/console/directory/tools/${t.id}`, { method: "DELETE" });
    load();
  }

  /** Goes and looks for our badge on the submitter’s own site. Manual,
   * never on a timer: it is an outbound request to someone else’s server
   * and the owner decides when to spend it, the same rule the analytics
   * integrations follow. */
  async function checkBadge(t: Tool) {
    setListBusy(`badge-${t.id}`);
    setError("");
    try {
      const res = await fetch(`/api/console/directory/tools/${t.id}/check-backlink`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not check that site.");
      if (!body.found) setError(`No badge found on ${t.website_url}. ${body.reason || ""}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check that site.");
    } finally {
      setListBusy("");
    }
  }

  async function review(t: Tool, action: "approve" | "send_approval_email") {
    setListBusy(`${action}-${t.id}`);
    setListMessage("");
    const res = await fetch(`/api/console/directory/tools/${t.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json().catch(() => ({}));
    setListBusy("");
    if (!res.ok) {
      setListMessage(body.error || "Something went wrong.");
    } else if (action === "send_approval_email") {
      setListMessage(body.email === "sent" ? `Approval email sent for ${t.name}.` : `No email needed for ${t.name} (added by an admin).`);
    }
    load();
  }

  async function fetchMissingLogos() {
    setListBusy("logos");
    setListMessage("");
    const found: string[] = [];
    const notFound: string[] = [];
    let after = 0;
    try {
      for (;;) {
        const res = await fetch("/api/console/directory/fetch-missing-logos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ after }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Logo fetch failed.");
        found.push(...body.found);
        notFound.push(...body.notFound);
        if (!body.next) break;
        after = body.next;
      }
      setListMessage(
        found.length === 0 && notFound.length === 0
          ? "Every tool already has a logo."
          : `Added ${found.length} logo(s).${notFound.length ? ` No logo found for: ${notFound.join(", ")}. Upload those by hand.` : ""}`
      );
    } catch (err) {
      setListMessage(err instanceof Error ? err.message : "Logo fetch failed.");
    }
    setListBusy("");
    load();
  }

  async function handlePublishAllPending() {
    const pending = tools.filter((t) => t.status === "pending");
    if (pending.length === 0) return;
    const ok = await confirm({ message: `Approve and publish all ${pending.length} waiting tool(s)? Each submitter gets an email.` });
    if (!ok) return;
    await Promise.all(
      pending.map((t) =>
        fetch(`/api/console/directory/tools/${t.id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        })
      )
    );
    load();
  }

  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));
  const needle = search.trim().toLowerCase();
  const shown = tools.filter(
    (t) =>
      (filter === "all" || t.status === filter) &&
      (!needle || t.name.toLowerCase().includes(needle) || (t.submitted_by_email || "").toLowerCase().includes(needle))
  );

  return (
    <div>
      <ConsoleDirectoryReview
        tools={tools}
        categories={categories}
        onChanged={load}
        onEdit={(id) => {
          const t = tools.find((x) => x.id === id);
          if (t) startEdit(t);
        }}
      />

      <form onSubmit={handleSubmit} className="rounded-2xl border border-line p-6">
        <p className="font-display text-lg font-semibold">
          {editingId ? "Edit tool" : "Add a tool"}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Tool name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink sm:col-span-2"
          />
          <input
            placeholder="Tagline (one line)"
            value={form.tagline}
            onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink sm:col-span-2"
          />
          <textarea
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={4}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink sm:col-span-2"
          />
          <BrandSelect
            value={form.category_id}
            onChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
            options={categoryOptions}
            placeholder="Category"
          />
          <input
            placeholder="Subcategory (optional)"
            value={form.subcategory}
            onChange={(e) => setForm((f) => ({ ...f, subcategory: e.target.value }))}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <BrandSelect
            value={form.pricing_type}
            onChange={(v) => setForm((f) => ({ ...f, pricing_type: v }))}
            options={PRICING_OPTIONS}
          />
          <input
            placeholder="Website or GitHub link"
            value={form.website_url}
            onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
            required
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>

        <div className="mt-4 rounded-lg border border-line p-4">
          <p className="text-sm font-medium">Logo</p>
          <p className="mt-1 text-xs text-ink-soft">
            Fetch the real logo from the tool&apos;s own domain, or upload one directly. Every logo is
            re-hosted on our own storage, never linked straight from the source site.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {form.logo_url && (
              <SafeImage src={form.logo_url} alt={`${form.name || "Tool"} logo`} width={40} height={40} className="h-10 w-10 rounded-md border border-line" />
            )}
            <input
              placeholder="tool-domain.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
            />
            <button
              type="button"
              onClick={fetchLogo}
              disabled={logoBusy || !domain}
              className="rounded-lg border border-line px-3 py-2 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
            >
              {logoBusy ? "Working..." : "Fetch logo"}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={logoBusy}
              className="rounded-lg border border-line px-3 py-2 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
            >
              Upload instead
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
            />
          </div>
          {logoError && <p className="mt-2 text-xs text-red-600">{logoError}</p>}
        </div>

        <div className="mt-4 rounded-lg border border-line p-4">
          <p className="text-sm font-medium">Screenshots</p>
          <p className="mt-1 text-xs text-ink-soft">Describe what each screenshot shows. This is the alt text Google and screen readers use.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {screenshots.map((s, i) => (
              <div key={s} className="relative w-40">
                <SafeImage src={s} alt={alts[s] || `${form.name || "Tool"} screenshot ${i + 1}`} width={160} height={90} className="h-[90px] w-40 rounded-md border border-line object-cover object-top" />
                <input
                  placeholder="Alt text"
                  value={alts[s] || ""}
                  onChange={(e) => setAlts((a) => ({ ...a, [s]: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-1 text-xs outline-none focus:border-ink"
                />
                <button
                  type="button"
                  onClick={() => setScreenshots((arr) => arr.filter((_, idx) => idx !== i))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-xs text-paper"
                >
                  ×
                </button>
              </div>
            ))}
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-line text-xs text-ink-soft hover:border-ink">
              +
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadScreenshot(e.target.files[0])}
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
            />
            Featured
          </label>
          <BrandSelect
            value={form.status}
            onChange={(v) => setForm((f) => ({ ...f, status: v }))}
            options={STATUS_OPTIONS}
            compact
            className="w-40"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Save changes" : "Add tool"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-sm text-ink-soft hover:text-ink">
              Cancel
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <BrandSelect value={filter} onChange={setFilter} options={FILTERS} compact className="w-48" />
        <input
          placeholder="Search name or submitter"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-ink"
        />
        <button
          onClick={fetchMissingLogos}
          disabled={listBusy === "logos"}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
        >
          {listBusy === "logos" ? "Fetching logos..." : `Fetch missing logos (${tools.filter((t) => !t.logo_url).length})`}
        </button>
        {tools.some((t) => t.status === "pending") && (
          <button
            onClick={handlePublishAllPending}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink"
          >
            Approve all waiting
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        {shown.length} of {tools.length} tools · {tools.filter((t) => t.status === "pending").length} waiting for review
      </p>
      {listMessage && <p className="mt-2 text-sm text-ink">{listMessage}</p>}

      <div className="mt-2 space-y-2">
        {shown.length === 0 && <p className="text-sm text-ink-soft">No tools here.</p>}
        {shown.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-xl border border-line bg-paper p-3">
            {t.logo_url ? (
              <SafeImage src={t.logo_url} alt={`${t.name} logo`} width={36} height={36} className="h-9 w-9 shrink-0 rounded-md border border-line" />
            ) : (
              <div className="h-9 w-9 shrink-0 rounded-md border border-line bg-paper-soft" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {t.name}{" "}
                <span className="text-xs font-normal text-ink-soft">
                  {t.category_name}
                  {t.subcategory ? ` / ${t.subcategory}` : ""}
                </span>
              </p>
              <p className="truncate text-xs text-ink-soft">{t.tagline}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                t.status === "published"
                  ? "bg-green-100 text-green-700"
                  : t.status === "pending"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-paper-soft text-ink-soft"
              }`}
            >
              {STATUS_LABELS[t.status] || t.status}
              {t.source === "api" ? " · via API" : ""}
              {t.source === "user" ? ` · submitted by ${t.submitted_by_email || "a user"}` : ""}
              {t.pending_edits > 0 ? " · edit requested" : ""}
            </span>
            {t.listing_tier === "free" && t.status !== "published" && (
              <button
                onClick={() => checkBadge(t)}
                disabled={listBusy === `badge-${t.id}`}
                title={t.backlink_error || undefined}
                className={`shrink-0 text-xs font-medium hover:underline disabled:opacity-50 ${
                  t.backlink_verified_at ? "text-ink-soft" : "text-ink"
                }`}
              >
                {listBusy === `badge-${t.id}`
                  ? "Checking..."
                  : t.backlink_verified_at
                    ? "Badge found"
                    : t.backlink_checked_at
                      ? "Badge missing, re-check"
                      : "Check badge"}
              </button>
            )}
            {t.status !== "published" && (
              <button
                onClick={() => review(t, "approve")}
                disabled={listBusy === `approve-${t.id}`}
                className="shrink-0 text-xs font-medium text-ink hover:underline disabled:opacity-50"
              >
                Approve
              </button>
            )}
            {t.status === "published" && t.source === "user" && !t.approved_email_sent_at && (
              <button
                onClick={() => review(t, "send_approval_email")}
                disabled={listBusy === `send_approval_email-${t.id}`}
                className="shrink-0 text-xs font-medium text-ink hover:underline disabled:opacity-50"
              >
                Send approval email
              </button>
            )}
            <button onClick={() => startEdit(t)} className="shrink-0 text-xs font-medium text-ink hover:underline">
              Edit
            </button>
            <Link href={`/console/directory/tools/${t.id}/page-sections`} className="shrink-0 text-xs font-medium text-ink hover:underline">
              Page sections
            </Link>
            <button
              onClick={() => handleDelete(t)}
              className="shrink-0 text-xs font-medium text-red-600 hover:underline"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      {dialog}
    </div>
  );
}
