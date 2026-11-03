"use client";

import { useEffect, useRef, useState } from "react";
import BrandSelect from "@/components/BrandSelect";
import { useConfirm } from "@/components/ConfirmDialog";

type Integration = { id: number; name: string; type: string; config: Record<string, unknown>; created_at: string };

function IntegrationValue({ type, value }: { type: string; value: string }) {
  const [revealed, setRevealed] = useState(type !== "api_key");
  if (type !== "api_key") return <p className="mt-1 text-xs text-ink-soft break-all">{value}</p>;
  return (
    <p className="mt-1 flex items-center gap-2 text-xs text-ink-soft break-all">
      {revealed ? value : "•".repeat(Math.min(value.length, 24)) || "••••••••"}
      <button type="button" onClick={() => setRevealed((r) => !r)} className="font-medium text-ink hover:underline">
        {revealed ? "Hide" : "Show"}
      </button>
    </p>
  );
}

export default function ConsoleIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("api_key");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const { confirm, dialog } = useConfirm();
  const mountedRef = useRef(true);

  async function load() {
    const res = await fetch("/api/console/integrations");
    const body = await res.json();
    if (!mountedRef.current) return;
    setIntegrations(body.integrations || []);
  }

  useEffect(() => {
    load();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    await fetch("/api/console/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, config: { value } }),
    });
    setName("");
    setValue("");
    setStatus("idle");
    load();
  }

  async function handleDelete(id: number, name: string) {
    const ok = await confirm({ message: `Remove the integration "${name}"? This can't be undone.` });
    if (!ok) return;
    await fetch(`/api/console/integrations/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="grid gap-3 rounded-2xl border border-line p-6 sm:grid-cols-4">
        <input
          placeholder="Name (e.g. n8n webhook)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink sm:col-span-1"
        />
        <BrandSelect
          value={type}
          onChange={setType}
          options={[
            { value: "api_key", label: "API key" },
            { value: "note", label: "Note / config value" },
          ]}
          className="sm:col-span-1"
        />
        <input
          placeholder="Value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink sm:col-span-1"
        />
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50 sm:col-span-1"
        >
          {status === "saving" ? "Saving…" : "Add"}
        </button>
      </form>

      <div className="mt-6 space-y-3">
        {integrations.length === 0 && (
          <p className="text-sm text-ink-soft">No integrations added yet.</p>
        )}
        {integrations.map((i) => (
          <div
            key={i.id}
            className="flex items-center justify-between rounded-2xl border border-line bg-paper p-4"
          >
            <div>
              <p className="text-sm font-medium">
                {i.name} <span className="text-ink-soft">({i.type})</span>
              </p>
              <IntegrationValue type={i.type} value={String(i.config?.value ?? "")} />
            </div>
            <button
              onClick={() => handleDelete(i.id, i.name)}
              className="rounded-full border border-red-600 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      {dialog}
    </div>
  );
}
