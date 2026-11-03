"use client";

import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatDay } from "@/lib/formatDate";
import { SCOPE_RESOURCES, type ApiScope } from "@/lib/apiScopes";
import BrandSelect from "@/components/BrandSelect";

type ResourceLevel = "none" | "read" | "write" | "readwrite";

function levelOf(scopes: string[], read: ApiScope, write: ApiScope): ResourceLevel {
  const hasRead = scopes.includes(read);
  const hasWrite = scopes.includes(write);
  if (hasRead && hasWrite) return "readwrite";
  if (hasWrite) return "write";
  if (hasRead) return "read";
  return "none";
}

function applyLevel(scopes: string[], read: ApiScope, write: ApiScope, level: ResourceLevel): string[] {
  const without = scopes.filter((s) => s !== read && s !== write);
  if (level === "read") return [...without, read];
  if (level === "write") return [...without, write];
  if (level === "readwrite") return [...without, read, write];
  return without;
}

type ApiKey = {
  id: number;
  label: string;
  scopes: string[];
  key_prefix: string;
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  issued_via: "manual" | "oauth";
};

function KeyRow({ k, onRevoke, onClear }: { k: ApiKey; onRevoke: (k: ApiKey) => void; onClear: (k: ApiKey) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-4">
      <div>
        <p className="text-sm font-medium">
          {k.label}{" "}
          {k.revoked_at && <span className="text-xs font-normal text-red-600">(revoked)</span>}
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          {k.key_prefix}... scopes: {k.scopes.join(", ")} &middot; created {formatDay(k.created_at)}
          {k.created_by ? ` by ${k.created_by}` : ""}
          {k.last_used_at ? `, last used ${formatDay(k.last_used_at)}` : ", never used"}
        </p>
      </div>
      {!k.revoked_at ? (
        <button
          onClick={() => onRevoke(k)}
          className="shrink-0 rounded-full border border-red-600 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          Revoke
        </button>
      ) : (
        <button
          onClick={() => onClear(k)}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-paper-soft hover:text-ink"
        >
          Clear
        </button>
      )}
    </div>
  );
}

export default function ConsoleApiTokens({ siteUrl }: { siteUrl: string }) {
  const [tab, setTab] = useState<"mcp" | "api">("mcp");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const mountedRef = useRef(true);

  async function load() {
    const res = await fetch("/api/console/api-tokens");
    const body = await res.json();
    if (!mountedRef.current) return;
    setKeys(body.keys || []);
  }

  useEffect(() => {
    load();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function setResourceLevel(read: ApiScope, write: ApiScope, level: ResourceLevel) {
    setScopes((prev) => applyLevel(prev, read, write, level));
  }

  function toggleAll() {
    setScopes((prev) => (prev.includes("*") ? [] : ["*"]));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/console/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, scopes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Something went wrong (${res.status}).`);
      } else {
        setNewToken(body.token);
        setLabel("");
        setScopes([]);
        load();
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(k: ApiKey) {
    const ok = await confirm({ message: `Revoke the key "${k.label}"? Anything using it -- including any MCP connection -- will stop working immediately.` });
    if (!ok) return;
    await fetch(`/api/console/api-tokens/${k.id}`, { method: "DELETE" });
    load();
  }

  async function handleClear(k: ApiKey) {
    const ok = await confirm({ message: `Permanently remove the revoked key "${k.label}" from this list? This can't be undone.` });
    if (!ok) return;
    const res = await fetch(`/api/console/api-tokens/${k.id}?permanent=true`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Couldn't clear that key.");
      return;
    }
    load();
  }

  const mcpUrl = `${siteUrl.replace(/\/$/, "")}/api/mcp`;
  const mcpKeys = keys.filter((k) => k.issued_via === "oauth");
  const apiKeys = keys.filter((k) => k.issued_via !== "oauth");

  return (
    <div>
      <div className="flex gap-2 border-b border-line">
        {(["mcp", "api"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t === "mcp" ? "MCP" : "API"}
          </button>
        ))}
      </div>

      {tab === "mcp" && (
        <div className="mt-8">
          <section>
            <h2 className="font-display text-lg font-semibold">Connect an AI agent (MCP)</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">
              Issue a token from the API tab, then either connect remotely (no setup on your own
              machine) or run the local server from this repo. Both talk to the exact same API with
              the exact same token.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-line p-4">
                <p className="text-sm font-medium">Remote</p>
                <p className="mt-1 text-xs text-ink-soft">Add this as a remote MCP server, with your token as a Bearer header.</p>
                <code className="mt-2 block overflow-x-auto rounded-lg bg-paper-soft p-3 text-xs">{mcpUrl}</code>
              </div>
              <div className="rounded-2xl border border-line p-4">
                <p className="text-sm font-medium">Local</p>
                <p className="mt-1 text-xs text-ink-soft">Run from a clone of this repo, pointed at your deployed site.</p>
                <code className="mt-2 block overflow-x-auto rounded-lg bg-paper-soft p-3 text-xs">
                  SITE_URL={siteUrl} API_TOKEN=... node scripts/mcp/stdio.mjs
                </code>
              </div>
            </div>
            {/* mcpUrl and the SITE_URL shown above are both built from this
             * deployment's own siteUrl prop (@/config/brand's SITE_URL) --
             * never hardcoded, so a self-hosted install shows its own
             * domain here, not this site's. */}
          </section>

          <section className="mt-10">
            <h2 className="font-display text-lg font-semibold">MCP tokens</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">
              Issued automatically when an MCP client (Claude.ai, or anything else that speaks MCP)
              connects to the remote server above and completes the OAuth flow -- not something you
              create by hand here. Revoke one to disconnect that client immediately.
            </p>
            <div className="mt-4 space-y-2">
              {mcpKeys.length === 0 && <p className="text-sm text-ink-soft">No MCP client has connected yet.</p>}
              {mcpKeys.map((k) => (
                <KeyRow key={k.id} k={k} onRevoke={handleRevoke} onClear={handleClear} />
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "api" && (
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">API tokens</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          One token works for both the REST API (<code className="rounded bg-paper-soft px-1.5 py-0.5">/api/v1/*</code>,
          Bearer auth) and MCP. Scope it to only what the caller actually needs.
        </p>

        <form onSubmit={handleCreate} className="mt-4 rounded-2xl border border-line p-6">
          <input
            placeholder="Key label (e.g. Claude desktop, n8n automation)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={scopes.includes("*")} onChange={toggleAll} />
              <span className="font-medium">All resources, read &amp; write</span>
              <span className="text-xs text-ink-soft">(full access -- for your own automation/MCP use)</span>
            </label>
          </div>
          <div className={`mt-4 space-y-2 ${scopes.includes("*") ? "pointer-events-none opacity-40" : ""}`}>
            {SCOPE_RESOURCES.map(({ resource, label: resourceLabel, read, write }) => (
              <div key={resource} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <span className="text-sm">{resourceLabel}</span>
                <div className="w-36">
                  <BrandSelect
                    value={levelOf(scopes, read, write)}
                    onChange={(v) => setResourceLevel(read, write, v as ResourceLevel)}
                    options={[
                      { value: "none", label: "No access" },
                      { value: "read", label: "Read only" },
                      { value: "write", label: "Write only" },
                      { value: "readwrite", label: "Read & write" },
                    ]}
                    compact
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="submit"
            disabled={saving || scopes.length === 0 || !label}
            className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create token"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {newToken && (
          <div className="mt-4 rounded-2xl border border-ink bg-paper-soft p-4">
            <p className="text-sm font-medium">Copy this token now. It will not be shown again.</p>
            <code className="mt-2 block overflow-x-auto rounded-lg bg-paper p-3 text-xs">{newToken}</code>
            <button onClick={() => setNewToken(null)} className="mt-2 text-xs font-medium text-ink hover:underline">
              Done, I&apos;ve copied it
            </button>
          </div>
        )}

        <div className="mt-6 space-y-2">
          {apiKeys.length === 0 && <p className="text-sm text-ink-soft">No API tokens yet.</p>}
          {apiKeys.map((k) => (
            <KeyRow key={k.id} k={k} onRevoke={handleRevoke} onClear={handleClear} />
          ))}
        </div>
      </section>
      )}
      {dialog}
    </div>
  );
}
