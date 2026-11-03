"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { EDITABLE_FIELDS, PRICING_OPTIONS, STATUS_LABELS } from "@/lib/directoryFields";

type Category = { id: number; name: string };

export type ReviewTool = {
  id: number;
  name: string;
  tagline: string | null;
  description: string | null;
  category_name: string;
  pricing_type: string;
  website_url: string;
  logo_url: string | null;
  screenshots: string[];
  status: string;
  review_note: string | null;
  submitted_by_email: string | null;
  listing_tier?: "free" | "paid";
  paid_at?: string | null;
};

type EditRequest = {
  id: number;
  tool_id: number;
  name: string;
  user_email: string;
  message: string | null;
  changes: Record<string, unknown>;
} & Record<string, unknown>;

const pricingLabel = (v: unknown) => PRICING_OPTIONS.find((o) => o.value === v)?.label || String(v ?? "");

const EMAIL_RESULT: Record<string, string> = {
  sent: "Email sent to the submitter.",
  skipped: "No email needed (added by an admin or in the console).",
  already: "They were already emailed.",
};

/** Everything waiting on an admin: new and resubmitted tools, and edit
 * requests on live tools. Each decision emails the submitter. */
export default function ConsoleDirectoryReview({
  tools,
  categories,
  onChanged,
  onEdit,
}: {
  tools: ReviewTool[];
  categories: Category[];
  onChanged: () => void;
  onEdit: (id: number) => void;
}) {
  const [edits, setEdits] = useState<EditRequest[]>([]);
  const [noteFor, setNoteFor] = useState<{ key: string; action: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const mountedRef = useRef(true);

  async function loadEdits() {
    const res = await fetch("/api/console/directory/edits");
    const body = await res.json().catch(() => ({}));
    if (mountedRef.current) setEdits(body.edits || []);
  }

  useEffect(() => {
    mountedRef.current = true;
    loadEdits();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const queue = tools.filter((t) => t.status === "pending");
  const waitingOnSubmitter = tools.filter((t) => t.status === "changes_requested");

  async function act(key: string, url: string, payload: Record<string, unknown>) {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      setMessage(`Done. ${EMAIL_RESULT[body.email] || ""}`);
      setNoteFor(null);
      setNote("");
      onChanged();
      loadEdits();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  function noteBox(key: string, action: string, url: string, required: boolean, label: string) {
    if (noteFor?.key !== key || noteFor.action !== action) return null;
    return (
      <div className="mt-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={required ? "What should they change? For example: add 2 screenshots and a longer description." : "Reason (optional, included in the email)"}
          className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={busy === key || (required && !note.trim())}
            onClick={() => act(key, url, { action, note })}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-80 disabled:opacity-50"
          >
            {busy === key ? "Sending..." : label}
          </button>
          <button type="button" onClick={() => setNoteFor(null)} className="text-xs text-ink-soft hover:text-ink">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  function showValue(field: string, value: unknown) {
    if (field === "category_id") return categories.find((c) => c.id === Number(value))?.name || "Unknown";
    if (field === "pricing_type") return pricingLabel(value);
    if (field === "screenshots") return `${Array.isArray(value) ? value.length : 0} screenshot(s)`;
    return value ? String(value) : "(empty)";
  }

  if (queue.length === 0 && edits.length === 0 && waitingOnSubmitter.length === 0) return null;

  return (
    <div className="mb-8 rounded-2xl border border-ink p-6">
      <p className="font-display text-lg font-semibold">Needs review</p>
      <p className="mt-1 text-xs text-ink-soft">
        Approving, asking for changes, or declining emails the submitter. Tools you add yourself never send an email.
      </p>
      {message && <p className="mt-3 text-sm text-ink">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-4">
        {queue.map((t) => {
          const key = `tool-${t.id}`;
          const url = `/api/console/directory/tools/${t.id}/review`;
          return (
            <div key={t.id} className="rounded-xl border border-line p-4">
              <div className="flex items-start gap-3">
                {t.logo_url ? (
                  <Image src={t.logo_url} alt={`${t.name} logo`} width={40} height={40} className="h-10 w-10 shrink-0 rounded-md border border-line" />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-md border border-line bg-paper-soft" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {t.name} <span className="text-xs font-normal text-ink-soft">{t.category_name} · {pricingLabel(t.pricing_type)}{t.listing_tier === "paid" ? " · paid priority" : ""}</span>
                  </p>
                  <p className="text-xs text-ink-soft">
                    {t.submitted_by_email ? `Submitted by ${t.submitted_by_email}` : "Added by an admin or the API"}
                    {t.review_note ? " · resubmitted after changes" : ""}
                  </p>
                  {/* They can now pay during the submit flow, before anyone
                      has looked at it. Declining one of these owes them
                      their money back, and nothing refunds automatically. */}
                  {t.paid_at && (
                    <p className="mt-1 text-xs font-medium text-ink">
                      $5 already paid. Refund it in Razorpay or PayPal if you decline this.
                    </p>
                  )}
                  <a href={t.website_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 block truncate text-xs underline">
                    {t.website_url}
                  </a>
                  {t.tagline && <p className="mt-2 text-sm">{t.tagline}</p>}
                  {t.description && <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{t.description}</p>}
                  {t.review_note && (
                    <p className="mt-2 rounded-lg bg-paper-soft p-2 text-xs text-ink-soft">You asked: {t.review_note}</p>
                  )}
                  {t.screenshots.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {t.screenshots.map((s, i) => (
                        <a key={s} href={s} target="_blank" rel="noopener noreferrer">
                          <Image src={s} alt={`${t.name} screenshot ${i + 1}`} width={96} height={64} className="h-16 w-24 rounded-md border border-line object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === key}
                  onClick={() => act(key, url, { action: "approve" })}
                  className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-80 disabled:opacity-50"
                >
                  {busy === key && !noteFor ? "Approving..." : "Approve and publish"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNoteFor({ key, action: "request_changes" });
                    setNote("");
                  }}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:border-ink"
                >
                  Request changes
                </button>
                <button type="button" onClick={() => onEdit(t.id)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:border-ink">
                  Edit it myself
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNoteFor({ key, action: "reject" });
                    setNote("");
                  }}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:underline"
                >
                  Decline
                </button>
              </div>
              {noteBox(key, "request_changes", url, true, "Send change request")}
              {noteBox(key, "reject", url, false, "Decline and email them")}
            </div>
          );
        })}

        {edits.map((e) => {
          const key = `edit-${e.id}`;
          const url = `/api/console/directory/edits/${e.id}`;
          return (
            <div key={e.id} className="rounded-xl border border-line p-4">
              <p className="text-sm font-medium">
                Edit request: {e.name} <span className="text-xs font-normal text-ink-soft">from {e.user_email}</span>
              </p>
              {e.message && <p className="mt-1 text-xs text-ink-soft">&ldquo;{e.message}&rdquo;</p>}
              <div className="mt-3 space-y-2">
                {Object.entries(e.changes).map(([field, value]) => (
                  <div key={field} className="text-xs">
                    <p className="font-medium">{EDITABLE_FIELDS[field] || field}</p>
                    <p className="text-ink-soft line-through">{showValue(field, e[field])}</p>
                    <p className="whitespace-pre-line">{showValue(field, value)}</p>
                    {field === "screenshots" && Array.isArray(value) && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {(value as string[]).map((s, i) => (
                          <a key={s} href={s} target="_blank" rel="noopener noreferrer">
                            <Image src={s} alt={`${e.name} proposed screenshot ${i + 1}`} width={96} height={64} className="h-16 w-24 rounded-md border border-line object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === key}
                  onClick={() => act(key, url, { action: "approve" })}
                  className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-80 disabled:opacity-50"
                >
                  Approve changes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNoteFor({ key, action: "reject" });
                    setNote("");
                  }}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:underline"
                >
                  Decline
                </button>
              </div>
              {noteBox(key, "reject", url, false, "Decline and email them")}
            </div>
          );
        })}

        {waitingOnSubmitter.length > 0 && (
          <div className="text-xs text-ink-soft">
            <p className="font-medium text-ink">{STATUS_LABELS.changes_requested}, waiting on the submitter:</p>
            <ul className="mt-1 space-y-1">
              {waitingOnSubmitter.map((t) => (
                <li key={t.id}>
                  {t.name} ({t.submitted_by_email || "admin"}): {t.review_note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
