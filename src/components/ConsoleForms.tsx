"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConsoleModal from "@/components/ConsoleModal";
import { useConfirm } from "@/components/ConfirmDialog";
import type { FormDefinition } from "@/lib/formsShape";

const button =
  "inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton =
  "inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-60";
const pillDanger =
  "inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-600 disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition focus:border-ink";

const PAGE_SIZES = [10, 20, 30, 100];

const EditIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const TrashIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

type FormWithSubmissions = FormDefinition & { submissionCount: number };

function NewFormModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function slugify(val: string) {
    return val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/v1/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || "Untitled form",
        slug: slug.trim() || undefined,
        elements: [],
        fields: [],
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || "Couldn't create the form.");
    const formId = data.form?.id || data.id;
    router.push(`/console/forms/${formId}`);
  }

  return (
    <ConsoleModal title="New form" onClose={onClose}>
      <form onSubmit={create} className="space-y-4">
        <label className="grid gap-1.5 text-sm font-medium">
          Form name
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            className={inputClass}
            placeholder="Feedback form"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Direct shareable address (optional)
          <div className="flex items-center gap-1">
            <span className="text-sm text-ink-soft">/f/</span>
            <input
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value));
                setSlugTouched(true);
              }}
              className={inputClass}
              placeholder="feedback"
            />
          </div>
          <span className="text-xs font-normal text-ink-soft">
            Starts blank with an interactive drag-and-drop studio where you can drop fields, headings, buttons and style them freely.
          </span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={button}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Creating…" : "Create form"}
          </button>
        </div>
      </form>
    </ConsoleModal>
  );
}

export default function ConsoleForms({
  forms,
}: {
  forms: FormWithSubmissions[];
  fixedForms?: unknown[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  async function removeForm(form: FormWithSubmissions) {
    // Only the Sign up / Log in form is undeletable. Contact and Newsletter
    // are ordinary forms.
    if (form.isFixed) return;
    const ok = await confirm({
      message:
        `Delete the form "${form.name}"? Its ${form.submissionCount} recorded ` +
        `response${form.submissionCount === 1 ? "" : "s"} go with it, and any placed page blocks or ` +
        `links to /f/${form.slug || form.id} will stop working.` +
        (form.systemRole === "newsletter"
          ? " New newsletter signups through this form will stop too."
          : form.systemRole === "contact"
            ? " Messages will stop being filed under Contact submissions."
            : "") +
        " This can't be undone.",
      confirmLabel: "Delete",
    });
    if (!ok) return;

    setBusyId(form.id);
    setError("");
    const res = await fetch(`/api/v1/forms/${form.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusyId(null);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => ({}))) ?? {};
      setError(body.error || "Could not delete this form.");
      return;
    }
    router.refresh();
  }

  const currentList = forms;
  const totalPages = Math.max(1, Math.ceil(currentList.length / pageSize));
  const activePage = Math.min(Math.max(1, page), totalPages);
  const paginatedList = currentList.slice((activePage - 1) * pageSize, activePage * pageSize);

  const renderTable = (list: FormWithSubmissions[]) => (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-paper text-left text-xs uppercase tracking-wider text-ink-soft">
          <tr>
            <th className="px-4 py-3 font-semibold">Form</th>
            <th className="hidden px-4 py-3 font-semibold sm:table-cell">Type / Status</th>
            <th className="hidden px-4 py-3 font-semibold md:table-cell">Submissions</th>
            <th className="px-4 py-3 text-right font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-paper">
          {list.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3">
                <p className="font-medium text-ink">{row.name}</p>
                {row.slug ? (
                  <p className="text-xs text-ink-soft">/f/{row.slug}</p>
                ) : (
                  <p className="text-xs text-ink-soft">Embed only (no public slug)</p>
                )}
              </td>
              <td className="hidden px-4 py-3 sm:table-cell">
                {row.isFixed ? (
                  <span className="rounded-full bg-paper-soft px-2.5 py-1 text-xs font-semibold text-ink-soft">
                    Account form (fixed fields)
                  </span>
                ) : row.systemRole ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                    {row.systemRole === "newsletter" ? "Also subscribes" : "Also files a message"}
                  </span>
                ) : row.slug ? (
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                    Shareable link
                  </span>
                ) : (
                  <span className="rounded-full bg-paper-soft px-2.5 py-1 text-xs font-semibold text-ink-soft">
                    Embedded
                  </span>
                )}
              </td>
              <td className="hidden px-4 py-3 md:table-cell">
                <span className="text-sm font-medium text-ink">{row.submissionCount}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {row.slug && (
                    <a
                      href={`/f/${row.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className={button}
                    >
                      View
                    </a>
                  )}
                  <Link href={`/console/forms/${row.id}`} className={primaryButton}>
                    <EditIcon />
                    Edit
                  </Link>
                  <Link href={`/console/forms/${row.id}/submissions`} className={button}>
                    Responses
                    {row.submissionCount > 0 && (
                      <span className="rounded-full bg-paper-soft px-1.5 text-xs font-semibold">{row.submissionCount}</span>
                    )}
                  </Link>
                  {!row.isFixed && (
                    <button
                      type="button"
                      onClick={() => removeForm(row)}
                      disabled={busyId === row.id}
                      className={pillDanger}
                    >
                      <TrashIcon />
                      {busyId === row.id ? "Deleting…" : "Delete"}
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
      {dialog}
      {creating && <NewFormModal onClose={() => setCreating(false)} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-soft">
          Forms can be embedded into pages, opened as modal popups, or shared directly via their own standalone link.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCreating(true)} className={primaryButton}>
            + New form
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {currentList.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-8 text-center text-sm text-ink-soft">
          <p>No forms yet. Click &quot;+ New form&quot; to build your first one.</p>
        </div>
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
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    pageSize === size ? "bg-ink text-paper" : "bg-paper-soft text-ink hover:bg-paper"
                  }`}
                >
                  {size}
                </button>
              ))}
              <span>per page</span>
            </div>
            <div className="flex items-center gap-2">
              <span>
                Page {activePage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={activePage <= 1}
                className={button}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={activePage >= totalPages}
                className={button}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
