"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import type { MessageVariable } from "@/lib/messageVariables";

export default function EmailAttributeCatalog({ variables }: { variables: MessageVariable[] }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const groups = Array.from(new Set(variables.map((variable) => variable.group || "Other")));

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(`{{${token}}}`);
      setCopied(token);
      window.setTimeout(() => setCopied((current) => current === token ? "" : current), 2000);
    } catch {
      setCopied("");
    }
  }

  if (!variables.length) return null;
  return <section className="border-t border-line pt-4">
    <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">Attributes</h3>
    <p className="mt-1 text-xs leading-5 text-ink-soft">Copy a field and paste it into your email. Event fields need a matching workflow event.</p>
    <div className="mt-3 grid grid-cols-2 gap-2">
      {groups.map((group) => <button key={group} type="button" aria-expanded={openGroup === group} onClick={() => setOpenGroup((current) => current === group ? null : group)} className={`rounded-lg border px-2 py-2 text-left text-xs font-medium ${openGroup === group ? "border-ink bg-ink text-paper" : "border-line bg-paper hover:border-ink"}`}>{group}</button>)}
    </div>
    {openGroup && <div className="mt-3 max-h-80 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
      {variables.filter((variable) => (variable.group || "Other") === openGroup).map((variable) => <div key={variable.token} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-paper-soft">
        <div className="min-w-0 flex-1"><p className="text-xs font-medium">{variable.label}</p><code className="block truncate text-[10px] text-ink-soft" title={`{{${variable.token}}}`}>{`{{${variable.token}}}`}</code></div>
        <button type="button" onClick={() => void copy(variable.token)} aria-label={`Copy ${variable.label}`} title={`Copy {{${variable.token}}}`} className="rounded-md border border-line p-1.5 text-ink-soft hover:border-ink hover:text-ink"><Copy className="h-3.5 w-3.5" /></button>
      </div>)}
    </div>}
    {copied && <p role="status" className="mt-2 text-xs text-emerald-700">Copied {`{{${copied}}}`}</p>}
  </section>;
}
