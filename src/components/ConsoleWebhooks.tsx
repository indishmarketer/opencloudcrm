"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import ConsoleModal from "@/components/ConsoleModal";
import BrandSelect from "@/components/BrandSelect";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhookEventCatalogue";
import { SITE_URL } from "@/config/brand";

type Destination = {
  id: number;
  name: string;
  url: string;
  enabled: boolean;
  event_types: string[];
  description: string | null;
  masked_secret: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  pending_count: number;
  dead_count: number;
  success_rate: number | null;
};

type Delivery = {
  id: number;
  destination_id: number;
  destination_name: string;
  status: "pending" | "processing" | "delivered" | "failed" | "dead";
  attempt_count: number;
  next_attempt_at: string;
  last_http_status: number | null;
  last_response_excerpt: string | null;
  last_error: string | null;
  created_at: string;
  last_attempted_at: string | null;
  delivered_at: string | null;
  event_uuid: string;
  event_type: string;
  occurred_at: string;
  payload: unknown;
  is_test: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  pending: "text-ink-soft",
  processing: "text-ink-soft",
  delivered: "text-green-700",
  failed: "text-amber-700",
  dead: "text-red-600",
};

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString();
}

function DestinationForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: Destination;
  onCancel: () => void;
  onSaved: (revealedSecret?: string) => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [url, setUrl] = useState(initial?.url || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [events, setEvents] = useState<string[]>(initial?.event_types || []);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleEvent(key: string) {
    setEvents((prev) => (prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]));
  }

  async function handleSave() {
    setError("");
    if (!name.trim() || !url.trim()) {
      setError("Name and URL are required.");
      return;
    }
    setSaving(true);
    try {
      const res = initial
        ? await fetch(`/api/console/webhooks/destinations/${initial.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, url, description: description || null, event_types: events, enabled }),
          })
        : await fetch("/api/console/webhooks/destinations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, url, description: description || null, event_types: events, enabled }),
          });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not save destination.");
        setSaving(false);
        return;
      }
      onSaved(body.signing_secret);
    } catch {
      setError("Could not save destination.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-ink-soft">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. n8n workflow"
          className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink-soft">Destination URL</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-receiver.example.com/webhook"
          className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink-soft">Description (optional)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink-soft">Subscribed events</label>
        <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
          {WEBHOOK_EVENT_TYPES.map((evt) => (
            <label key={evt.key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={events.includes(evt.key)}
                onChange={() => toggleEvent(evt.key)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{evt.label}</span>{" "}
                <span className="text-ink-soft">({evt.key})</span>
                <br />
                <span className="text-xs text-ink-soft">{evt.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enabled
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function RevealSecretModal({ secret, onClose }: { secret: string; onClose: () => void }) {
  return (
    <ConsoleModal title="Signing secret" onClose={onClose}>
      <p className="text-sm text-ink-soft">
        Shown once. Copy it now and store it wherever your receiver verifies signatures — it
        won&apos;t be shown again in full.
      </p>
      <p className="mt-3 break-all rounded-lg border border-line bg-paper-soft p-3 font-mono text-xs">{secret}</p>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80"
        >
          Done
        </button>
      </div>
    </ConsoleModal>
  );
}

export default function ConsoleWebhooks() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [deliveriesTotal, setDeliveriesTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterDestination, setFilterDestination] = useState("");
  const [filterEvent, setFilterEvent] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDestination, setEditingDestination] = useState<Destination | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [expandedDelivery, setExpandedDelivery] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, string>>({});
  const { confirm, dialog } = useConfirm();

  const loadDestinations = useCallback(async () => {
    const res = await fetch("/api/console/webhooks/destinations");
    const body = await res.json();
    setDestinations(body.destinations || []);
  }, []);

  const loadDeliveries = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (filterDestination) params.set("destination_id", filterDestination);
    if (filterEvent) params.set("event_type", filterEvent);
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/console/webhooks/deliveries?${params}`);
    const body = await res.json();
    setDeliveries(body.deliveries || []);
    setDeliveriesTotal(body.total || 0);
  }, [page, filterDestination, filterEvent, filterStatus]);

  useEffect(() => {
    // Initial + filter-driven data fetch -- intentional effect that updates state from the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDestinations();
  }, [loadDestinations]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDeliveries();
  }, [loadDeliveries]);

  async function handleDelete(destination: Destination) {
    const ok = await confirm({
      message: `Remove the destination "${destination.name}"? Pending and queued deliveries to it will be deleted too. This can't be undone.`,
    });
    if (!ok) return;
    await fetch(`/api/console/webhooks/destinations/${destination.id}`, { method: "DELETE" });
    loadDestinations();
  }

  async function handleToggleEnabled(destination: Destination) {
    await fetch(`/api/console/webhooks/destinations/${destination.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !destination.enabled }),
    });
    loadDestinations();
  }

  async function handleRotateSecret(destination: Destination) {
    const ok = await confirm({
      message: `Rotate the signing secret for "${destination.name}"? Update it at your receiver right after — deliveries signed with the old secret will fail to verify.`,
      confirmLabel: "Rotate",
    });
    if (!ok) return;
    const res = await fetch(`/api/console/webhooks/destinations/${destination.id}/rotate-secret`, { method: "POST" });
    const body = await res.json();
    if (body.signing_secret) setRevealedSecret(body.signing_secret);
    loadDestinations();
  }

  async function handleTest(destination: Destination) {
    setTestResults((prev) => ({ ...prev, [destination.id]: "Sending…" }));
    const res = await fetch(`/api/console/webhooks/destinations/${destination.id}/test`, { method: "POST" });
    const body = await res.json();
    setTestResults((prev) => ({
      ...prev,
      [destination.id]: body.ok
        ? `Delivered (HTTP ${body.http_status})`
        : `Failed: ${body.error || `HTTP ${body.http_status ?? "no response"}`}`,
    }));
    loadDeliveries();
  }

  async function handleRetry(delivery: Delivery) {
    await fetch(`/api/console/webhooks/deliveries/${delivery.id}/retry`, { method: "POST" });
    loadDeliveries();
  }

  async function handleRetryBatch() {
    const ok = await confirm({
      message: filterDestination
        ? "Requeue up to 50 eligible failed/dead deliveries for this destination?"
        : "Requeue up to 50 eligible failed/dead deliveries across all destinations?",
      confirmLabel: "Retry batch",
    });
    if (!ok) return;
    await fetch("/api/console/webhooks/deliveries/retry-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination_id: filterDestination ? Number(filterDestination) : null }),
    });
    loadDeliveries();
  }

  return (
    <div className="space-y-12">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">Destinations</h2>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            Add destination
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {destinations.length === 0 && <p className="text-sm text-ink-soft">No outbound destinations yet.</p>}
          {destinations.map((d) => (
            <div key={d.id} className="rounded-2xl border border-line bg-paper p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {d.name}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        d.enabled ? "bg-green-100 text-green-700" : "bg-paper-soft text-ink-soft"
                      }`}
                    >
                      {d.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </p>
                  <p className="mt-1 break-all text-xs text-ink-soft">{d.url}</p>
                  {d.description && <p className="mt-1 text-xs text-ink-soft">{d.description}</p>}
                  <p className="mt-2 flex flex-wrap gap-1">
                    {d.event_types.length === 0 && <span className="text-xs text-ink-soft">No events subscribed</span>}
                    {d.event_types.map((e) => (
                      <span key={e} className="rounded-full border border-line px-2 py-0.5 text-xs">
                        {e}
                      </span>
                    ))}
                  </p>
                  <p className="mt-2 text-xs text-ink-soft">
                    Secret: <span className="font-mono">{d.masked_secret}</span> · Last success: {fmt(d.last_success_at)} ·
                    Last failure: {fmt(d.last_failure_at)} · Success rate:{" "}
                    {d.success_rate === null ? "—" : `${d.success_rate}%`} · Pending: {d.pending_count} · Dead:{" "}
                    {d.dead_count}
                  </p>
                  {testResults[d.id] && <p className="mt-1 text-xs font-medium">{testResults[d.id]}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(d)}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink"
                  >
                    {d.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTest(d)}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink"
                  >
                    Send test
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRotateSecret(d)}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink"
                  >
                    Rotate secret
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingDestination(d)}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(d)}
                    className="rounded-full border border-red-600 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="rounded-2xl border border-line bg-paper-soft p-5 text-sm">
          <p className="font-medium">Verifying a signature</p>
          <p className="mt-2 text-ink-soft">
            Every request carries <code className="rounded bg-paper px-1">X-Im-Webhook-Signature</code> (HMAC-SHA256 hex
            digest), <code className="rounded bg-paper px-1">X-Im-Webhook-Timestamp</code> (unix seconds),{" "}
            <code className="rounded bg-paper px-1">X-Im-Webhook-Event-Id</code>, and{" "}
            <code className="rounded bg-paper px-1">X-Im-Webhook-Event-Type</code>. Recompute{" "}
            <code className="rounded bg-paper px-1">HMAC_SHA256(secret, timestamp + &quot;.&quot; + raw_request_body)</code>{" "}
            and compare it to the signature header using a constant-time comparison. A 2xx response marks the delivery
            successful; anything else is retried with exponential backoff (redirects are never followed).
          </p>
          <p className="mt-2 text-ink-soft">
            Testing your own setup? Point a destination at{" "}
            <code className="rounded bg-paper px-1">{SITE_URL}/api/webhooks/echo-test</code> first
            — it always returns 200, no receiver of your own required.
          </p>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Delivery log</h2>
          <button
            type="button"
            onClick={handleRetryBatch}
            className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink"
          >
            Retry eligible batch
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <BrandSelect
            value={filterDestination}
            onChange={(v) => {
              setFilterDestination(v);
              setPage(1);
            }}
            placeholder="All destinations"
            options={[{ value: "", label: "All destinations" }, ...destinations.map((d) => ({ value: String(d.id), label: d.name }))]}
          />
          <BrandSelect
            value={filterEvent}
            onChange={(v) => {
              setFilterEvent(v);
              setPage(1);
            }}
            placeholder="All events"
            options={[{ value: "", label: "All events" }, ...WEBHOOK_EVENT_TYPES.map((e) => ({ value: e.key, label: e.key }))]}
          />
          <BrandSelect
            value={filterStatus}
            onChange={(v) => {
              setFilterStatus(v);
              setPage(1);
            }}
            placeholder="All statuses"
            options={[
              { value: "", label: "All statuses" },
              { value: "pending", label: "Pending" },
              { value: "processing", label: "Processing" },
              { value: "delivered", label: "Delivered" },
              { value: "failed", label: "Failed (retrying)" },
              { value: "dead", label: "Dead" },
            ]}
          />
        </div>

        <div className="mt-4 space-y-2">
          {deliveries.length === 0 && <p className="text-sm text-ink-soft">No deliveries match these filters.</p>}
          {deliveries.map((d) => (
            <div key={d.id} className="rounded-xl border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{d.destination_name}</span> ·{" "}
                  <span className="text-ink-soft">{d.event_type}</span>
                  {d.is_test && <span className="ml-2 rounded-full bg-paper-soft px-2 py-0.5 text-xs">test</span>}
                  <span className={`ml-2 font-medium ${STATUS_STYLES[d.status] || ""}`}>{d.status}</span>
                  <p className="text-xs text-ink-soft">
                    Attempt {d.attempt_count} · HTTP {d.last_http_status ?? "—"} · Created {fmt(d.created_at)} ·
                    {d.status === "delivered" ? ` Delivered ${fmt(d.delivered_at)}` : ` Next try ${fmt(d.next_attempt_at)}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedDelivery(expandedDelivery === d.id ? null : d.id)}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink"
                  >
                    {expandedDelivery === d.id ? "Hide details" : "Details"}
                  </button>
                  {(d.status === "failed" || d.status === "dead") && (
                    <button
                      type="button"
                      onClick={() => handleRetry(d)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
              {expandedDelivery === d.id && (
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  <p className="text-xs font-medium">Request payload sent</p>
                  <pre className="overflow-x-auto rounded-lg bg-paper-soft p-3 text-xs">
                    {JSON.stringify(d.payload, null, 2)}
                  </pre>
                  {(d.last_response_excerpt || d.last_error) && (
                    <>
                      <p className="text-xs font-medium">Response / error</p>
                      <pre className="overflow-x-auto rounded-lg bg-paper-soft p-3 text-xs">
                        {d.last_error || d.last_response_excerpt}
                      </pre>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {deliveriesTotal > 50 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-ink-soft">
              Page {page} of {Math.ceil(deliveriesTotal / 50)}
            </span>
            <button
              type="button"
              disabled={page >= Math.ceil(deliveriesTotal / 50)}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </section>

      {showAddForm && (
        <ConsoleModal title="Add destination" onClose={() => setShowAddForm(false)}>
          <DestinationForm
            onCancel={() => setShowAddForm(false)}
            onSaved={(secret) => {
              setShowAddForm(false);
              loadDestinations();
              if (secret) setRevealedSecret(secret);
            }}
          />
        </ConsoleModal>
      )}
      {editingDestination && (
        <ConsoleModal title="Edit destination" onClose={() => setEditingDestination(null)}>
          <DestinationForm
            initial={editingDestination}
            onCancel={() => setEditingDestination(null)}
            onSaved={() => {
              setEditingDestination(null);
              loadDestinations();
            }}
          />
        </ConsoleModal>
      )}
      {revealedSecret && <RevealSecretModal secret={revealedSecret} onClose={() => setRevealedSecret(null)} />}
      {dialog}
    </div>
  );
}
