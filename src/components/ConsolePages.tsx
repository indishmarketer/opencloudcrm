"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConsoleModal from "@/components/ConsoleModal";
import { useConfirm } from "@/components/ConfirmDialog";
import { normalizePagePath } from "@/lib/sitePagesShape";

const button =
  "rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton =
  "rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-60";
const pillDanger =
  "rounded-full border border-line px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-600 disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition focus:border-ink";

const PAGE_SIZES = [10, 20, 30, 100];

export type PageRow = {
  id: number | null;
  path: string;
  title: string;
  status: "draft" | "published";
  hasUnpublishedChanges: boolean;
  builtIn: boolean;
  builtInDefault: boolean;
  updatedAt: string | null;
};

function StatusBadge({ row }: { row: PageRow }) {
  const [label, tone] =
    row.status === "draft"
      ? ["Draft / offline", "bg-paper-soft text-ink-soft"]
      : row.hasUnpublishedChanges
        ? ["Unpublished changes", "bg-amber-100 text-amber-900"]
        : ["Live", "bg-green-100 text-green-800"];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function NewPageModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [pathTouched, setPathTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/v1/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        path,
        blocks: [{ type: "pageHeader", props: { heading: title, text: "" } }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || "Couldn't create the page.");
    router.push(`/console/pages/${data.page.id}`);
  }

  return (
    <ConsoleModal title="New page" onClose={onClose}>
      <form onSubmit={create} className="space-y-4">
        <label className="grid gap-1.5 text-sm font-medium">
          Title
          <input
            autoFocus
            required
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!pathTouched) setPath(normalizePagePath(e.target.value));
            }}
            className={inputClass}
            placeholder="Pricing"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Address
          <input
            required
            value={path}
            onChange={(e) => {
              setPath(e.target.value);
              setPathTouched(true);
            }}
            className={inputClass}
            placeholder="/pricing"
          />
          <span className="text-xs font-normal text-ink-soft">It starts as a draft. Nobody sees it until you publish.</span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={button}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Creating…" : "Create page"}
          </button>
        </div>
      </form>
    </ConsoleModal>
  );
}

export default function ConsolePages({
  rows,
  activeTab = "custom",
}: {
  rows: PageRow[];
  activeTab?: "custom" | "builtin";
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [creating, setCreating] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);


  async function openBuiltIn(path: string) {
    setBusyPath(path);
    setError("");
    const res = await fetch("/api/v1/pages/edit-target", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyPath(null);
    if (!res.ok) return setError(data.error || "Couldn't open that page.");
    router.push(`/console/pages/${data.page.id}`);
  }

  async function removePage(row: PageRow) {
    if (!row.id) return;
    const isPublished = row.status === "published";
    const ok = await confirm({
      message: isPublished
        ? `Delete the published page "${row.title}" (${row.path})? This takes it down immediately and removes it from search. This can't be undone.`
        : `Delete the draft page "${row.title}"? This can't be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;

    setBusyId(row.id);
    setError("");
    const res = await fetch(`/api/v1/pages/${row.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusyId(null);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => ({}))) ?? {};
      setError(body.error || "Could not delete this page.");
      return;
    }
    router.refresh();
  }

  async function resetBuiltInPage(row: PageRow) {
    if (!row.id) return;
    const ok = await confirm({
      message: `Reset "${row.title}" to default? Your custom sections will be removed and the page will revert to its original built-in content.`,
      confirmLabel: "Reset",
    });
    if (!ok) return;

    setBusyId(row.id);
    setError("");
    const res = await fetch(`/api/v1/pages/${row.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusyId(null);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => ({}))) ?? {};
      setError(body.error || "Could not reset this page.");
      return;
    }
    router.refresh();
  }

  async function exportFile() {
    setError("");
    const res = await fetch("/api/v1/pages/export");
    if (!res.ok) return setError("Export failed.");
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `pages-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    setError("");
    setMessage("Importing…");
    try {
      const text = await file.text();
      const res = await fetch("/api/v1/pages/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Import failed.");
      const outcomes = data.pages as { path: string; result: string; error?: string }[];
      const failed = outcomes.filter((o) => o.result === "error");
      const parts = [
        `${outcomes.length - failed.length} page${outcomes.length - failed.length === 1 ? "" : "s"} imported`,
        data.navigation ? "menu and footer updated" : "",
        data.business ? "business details updated" : "",
      ].filter(Boolean);
      setMessage(parts.join(", ") + ".");
      if (failed.length) setError(failed.map((f) => `${f.path}: ${f.error}`).join(" · "));
      router.refresh();
    } catch (err) {
      setMessage("");
      setError(err instanceof Error ? err.message : "Import failed.");
    }
  }

  const custom = rows.filter((r) => !r.builtIn);
  const builtIn = rows.filter((r) => r.builtIn);
  const currentList = activeTab === "builtin" ? builtIn : custom;

  const totalPages = Math.max(1, Math.ceil(currentList.length / pageSize));
  const activePage = Math.min(Math.max(1, page), totalPages);
  const paginatedList = currentList.slice((activePage - 1) * pageSize, activePage * pageSize);

  const renderTable = (list: PageRow[]) => (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-paper text-left text-xs uppercase tracking-wider text-ink-soft">
          <tr>
            <th className="px-4 py-3 font-semibold">Page</th>
            <th className="hidden px-4 py-3 font-semibold sm:table-cell">Status</th>
            <th className="px-4 py-3 text-right font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-paper">
          {list.map((row) => (
            <tr key={row.path}>
              <td className="px-4 py-3">
                <p className="font-medium text-ink">{row.title}</p>
                <p className="text-xs text-ink-soft">{row.path}</p>
              </td>
              <td className="hidden px-4 py-3 sm:table-cell">
                {row.builtInDefault ? <span className="text-xs text-ink-soft">Default</span> : <StatusBadge row={row} />}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {row.status === "published" && (
                    <a href={row.path} target="_blank" rel="noreferrer" className={button}>
                      View
                    </a>
                  )}
                  {row.id ? (
                    <Link href={`/console/pages/${row.id}`} className={primaryButton}>
                      Edit
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openBuiltIn(row.path)}
                      disabled={busyPath === row.path}
                      className={primaryButton}
                    >
                      {busyPath === row.path ? "Opening…" : "Edit"}
                    </button>
                  )}
                  {/* Delete button: For custom pages (except home /) */}
                  {!row.builtIn && row.id && row.path !== "/" && (
                    <button
                      type="button"
                      onClick={() => removePage(row)}
                      disabled={busyId === row.id}
                      className={pillDanger}
                    >
                      {busyId === row.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                  {/* Reset button: For built-in pages that have custom edits */}
                  {row.builtIn && row.id && !row.builtInDefault && (
                    <button
                      type="button"
                      onClick={() => resetBuiltInPage(row)}
                      disabled={busyId === row.id}
                      className={pillDanger}
                    >
                      {busyId === row.id ? "Resetting…" : "Reset"}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {creating && <NewPageModal onClose={() => setCreating(false)} />}

      {activeTab === "custom" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-ink-soft">
            Every page is a stack of sections you can edit, reorder, add or delete. Changes stay private until you publish.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportFile} className={button}>
              Export
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className={button}>
              Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = "";
              }}
            />
            <button type="button" onClick={() => setCreating(true)} className={primaryButton}>
              + New page
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-soft">
          These pages have their own content (the course list, the directory, policy text). Add sections around it, edit
          the heading, or remove it and build the page yourself. &ldquo;Reset to default&rdquo; undoes everything.
        </p>
      )}

      {(message || error) && (
        <div className="space-y-1 text-sm">
          {message && <p className="text-ink-soft">{message}</p>}
          {error && <p className="text-red-600">{error}</p>}
        </div>
      )}

      {currentList.length === 0 ? (
        <p className="text-sm text-ink-soft">
          {activeTab === "custom" ? "No pages yet." : "No built-in pages."}
        </p>
      ) : (
        <>
          {renderTable(paginatedList)}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
            <div className="flex items-center gap-2">
              <span>Show</span>
              {PAGE_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    setPageSize(size);
                    setPage(1);
                  }}
                  className={`rounded-md px-2 py-1 font-medium transition-colors ${
                    pageSize === size ? "bg-paper-soft text-ink" : "hover:text-ink"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-3">
                {activePage > 1 ? (
                  <button
                    type="button"
                    onClick={() => setPage(activePage - 1)}
                    className="font-medium hover:text-ink"
                  >
                    Previous
                  </button>
                ) : (
                  <span className="opacity-40">Previous</span>
                )}
                <span>
                  Page {activePage} of {totalPages}
                </span>
                {activePage < totalPages ? (
                  <button
                    type="button"
                    onClick={() => setPage(activePage + 1)}
                    className="font-medium hover:text-ink"
                  >
                    Next
                  </button>
                ) : (
                  <span className="opacity-40">Next</span>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {dialog}
    </div>
  );
}
