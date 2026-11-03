"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

type Trigger = { value: string; label: string; description: string };
type Folder = { id: number; name: string };
type Workflow = { id: number; name: string; description: string; status: string; trigger_type: string; trigger_key: string | null; folder_id: number | null; graph: { nodes: { data: { kind: string; label?: string } }[] }; updated_at: string };
type EmailFlow = { id: number; name: string; trigger_key: string; active: boolean; course_id: number | null; course_title: string | null; folder_id: number | null; step_count: number; has_wait: boolean; has_email_action: boolean; has_review_request: boolean; step_titles: string[] };
type SystemFlow = { id: string; name: string; trigger: string; actions: readonly string[]; detail: string; source: string };
type ToolKind = "email" | "review" | "whatsapp" | "webhook" | "condition" | "course_access" | "wait" | "stop";

function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 6.5h17M9 6.5V4h6v2.5m-9.5 0 1 14h11l1-14M10 10v7m4-7v7" /></svg>;
}

function TriggerIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="currentColor"><path d="M13.2 1.8 4.7 13h5.6l-.8 9.2L19.3 9.7h-6.1l1-7.9Z" /></svg>;
}

function ToolGlyph({ kind }: { kind: ToolKind }) {
  if (kind === "email" || kind === "review") return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" />{kind === "review" && <path d="m12 8 .9 2.2 2.4.2-1.8 1.5.6 2.3-2.1-1.2-2.1 1.2.6-2.3-1.8-1.5 2.4-.2L12 8Z" />}</svg>;
  if (kind === "whatsapp") return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z" /><path d="M9 8.5c.5 2.4 2.1 4 4.5 4.5" /></svg>;
  if (kind === "webhook") return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 6h4a4 4 0 0 1 4 4v6M14 16l2 2 2-2" /></svg>;
  if (kind === "condition") return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" /></svg>;
  if (kind === "course_access") return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z" /><path d="M4 17a2.5 2.5 0 0 1 2.5-2.5H20M8 7h8m-8 3h6" /></svg>;
  if (kind === "wait") return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>;
}

function ToolIcons({ tools }: { tools: ToolKind[] }) {
  const labels: Record<ToolKind, string> = { email: "Email", review: "Google review", whatsapp: "WhatsApp", webhook: "Webhook", condition: "Condition", course_access: "Course access", wait: "Wait", stop: "End" };
  return <div className="flex items-center gap-1.5">
    {tools.length ? tools.map((kind, index) => <span key={`${kind}-${index}`} title={labels[kind]} aria-label={labels[kind]} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-paper text-ink"><ToolGlyph kind={kind} /></span>) : <span className="text-sm text-ink-soft">—</span>}
  </div>;
}

function WorkflowToggle({ on, label, disabled, onToggle }: { on: boolean; label: string; disabled: boolean; onToggle: () => void }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} title={on ? "Turn off" : "Turn on"} disabled={disabled} onClick={onToggle} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-wait disabled:opacity-60 ${on ? "bg-green-600" : "bg-[#b7b5ae]"}`}>
    <span aria-hidden="true" className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
  </button>;
}

function FlowMap({ trigger, actions }: { trigger: string; actions: readonly string[] }) {
  return <div className="flex min-w-max flex-nowrap items-center gap-2">
    <div className="min-w-36 rounded-xl border border-line bg-paper-soft px-3 py-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Trigger</p><p className="mt-1 text-xs font-medium">{trigger}</p></div>
    {actions.map((action, index) => <div key={`${index}-${action}`} className="flex items-center gap-2"><span aria-hidden="true" className="text-ink-soft">→</span><div className="min-w-36 rounded-xl border border-line bg-paper-soft px-3 py-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Action {index + 1}</p><p className="mt-1 text-xs font-medium">{action}</p></div></div>)}
  </div>;
}

function toolsForWorkflow(workflow: Workflow): ToolKind[] {
  const allowed = new Set<ToolKind>(["email", "whatsapp", "webhook", "condition", "course_access", "wait", "stop"]);
  return Array.from(new Set(workflow.graph.nodes.filter((node) => node.data.kind !== "trigger" && allowed.has(node.data.kind as ToolKind)).map((node) => node.data.kind as ToolKind)));
}

export default function ConsoleWorkflows({ workflows, triggers, emailFlows, folders, systemFlows, webhookDestinations }: {
  workflows: Workflow[];
  triggers: Trigger[];
  emailFlows: EmailFlow[];
  folders: Folder[];
  systemFlows: readonly SystemFlow[];
  webhookDestinations: { id: number; name: string; enabled: boolean; event_types: string[] }[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<"mine" | "critical">("mine");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [folderList, setFolderList] = useState(folders);
  const [activeFolder, setActiveFolder] = useState("all");
  const [search, setSearch] = useState("");
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderName, setFolderName] = useState("");
  const triggerName = (key: string | null) => triggers.find((item) => item.value === key)?.label || key || "Incoming webhook";
  const matches = (row: { name: string; folder_id: number | null }) =>
    (activeFolder === "all" || row.folder_id === Number(activeFolder)) && row.name.toLowerCase().includes(search.trim().toLowerCase());
  const visibleWorkflows = workflows.filter(matches);
  const visibleEmailFlows = emailFlows.filter(matches);

  async function create() {
    setBusy(true); setError("");
    const response = await fetch("/api/console/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    setBusy(false);
    if (!response?.ok) { setError(body.error || "Could not create this workflow."); return; }
    router.push(`/console/workflows/${body.workflow.id}`);
  }

  async function deleteCustomWorkflow(workflow: Workflow) {
    if (!(await confirm({ message: `Delete “${workflow.name}”? It will stop receiving new events and queued runs will be canceled. Run history is kept in the database for recovery. This workflow will disappear from the console.`, confirmLabel: "Delete workflow" }))) return;
    setError("");
    const response = await fetch(`/api/console/workflows/${workflow.id}`, { method: "DELETE" }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    if (!response?.ok) { setError(body.error || "Could not delete this workflow."); return; }
    router.refresh();
  }

  async function deleteEmailWorkflow(flow: EmailFlow) {
    if (!(await confirm({ message: `Delete “${flow.name}”? It will stop enrolling people and cancel pending emails. Sent emails and delivery history are kept. You can create a new workflow with the same trigger later.`, confirmLabel: "Delete workflow" }))) return;
    setError("");
    const response = await fetch(`/api/console/automation/flows/${flow.id}`, { method: "DELETE" }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    if (!response?.ok) { setError(body.error || "Could not delete this workflow."); return; }
    router.refresh();
  }

  async function toggleCustomWorkflow(workflow: Workflow) {
    const key = `workflow-${workflow.id}`;
    setSavingKey(key); setError("");
    const status = workflow.status === "active" ? "paused" : "active";
    const response = await fetch(`/api/console/workflows/${workflow.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    setSavingKey("");
    if (!response?.ok) { setError(body.error || "Could not change this workflow status."); return; }
    router.refresh();
  }

  async function toggleEmailWorkflow(flow: EmailFlow) {
    const key = `email-${flow.id}`;
    setSavingKey(key); setError("");
    const response = await fetch(`/api/console/automation/flows/${flow.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !flow.active }) }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    setSavingKey("");
    if (!response?.ok) { setError(body.error || "Could not change this email workflow status."); return; }
    router.refresh();
  }

  async function createFolder() {
    const name = folderName.trim();
    if (!name) return;
    setError("");
    const response = await fetch("/api/console/workflow-folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    if (!response?.ok) { setError(body.error || "Could not create folder."); return; }
    setFolderList((current) => [...current, body.folder].sort((a, b) => a.name.localeCompare(b.name)));
    setActiveFolder(String(body.folder.id));
    setFolderName("");
    setShowFolderForm(false);
  }

  async function moveToFolder(type: "workflow" | "email", id: number, value: string) {
    const key = `${type}-${id}`;
    setSavingKey(key); setError("");
    const response = await fetch("/api/console/workflow-folders/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id, folderId: value ? Number(value) : null }) }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    setSavingKey("");
    if (!response?.ok) { setError(body.error || "Could not move this workflow."); return; }
    router.refresh();
  }

  return <div>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex gap-2 border-b border-line" role="tablist" aria-label="Workflow categories">
        <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === "mine" ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>Your workflows</button>
        <button type="button" role="tab" aria-selected={tab === "critical"} onClick={() => setTab("critical")} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === "critical" ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>Critical workflows</button>
      </div>
      {tab === "mine" && <button type="button" disabled={busy} onClick={() => void create()} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50">{busy ? "Opening canvas..." : "New workflow"}</button>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

    {tab === "mine" ? <div className="mt-5 space-y-8">
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="relative min-w-56 flex-1 sm:max-w-md"><span className="sr-only">Search workflows</span><svg viewBox="0 0 24 24" aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></svg><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workflows" className="w-full rounded-lg border border-line bg-paper py-2.5 pl-9 pr-3 text-sm outline-none focus:border-ink" /></label>
          <button type="button" onClick={() => setShowFolderForm(true)} className="rounded-full border border-line px-4 py-2.5 text-sm font-medium hover:border-ink">+ New folder</button>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Workflow folders">
          <button type="button" role="tab" aria-selected={activeFolder === "all"} onClick={() => setActiveFolder("all")} className={`rounded-full px-3.5 py-2 text-sm font-medium ${activeFolder === "all" ? "bg-ink text-paper" : "border border-line text-ink-soft hover:text-ink"}`}>All workflows</button>
          {folderList.map((folder) => <button key={folder.id} type="button" role="tab" aria-selected={activeFolder === String(folder.id)} onClick={() => setActiveFolder(String(folder.id))} className={`rounded-full px-3.5 py-2 text-sm font-medium ${activeFolder === String(folder.id) ? "bg-ink text-paper" : "border border-line text-ink-soft hover:text-ink"}`}>{folder.name}</button>)}
        </div>
        {showFolderForm && <div className="mb-4 flex max-w-xl flex-wrap items-center gap-2 rounded-xl border border-line bg-paper p-3"><label className="min-w-48 flex-1"><span className="sr-only">New folder name</span><input autoFocus maxLength={80} value={folderName} onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createFolder(); if (event.key === "Escape") setShowFolderForm(false); }} placeholder="Folder name" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink" /></label><button type="button" onClick={() => void createFolder()} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper">Create folder</button><button type="button" onClick={() => { setShowFolderForm(false); setFolderName(""); }} className="rounded-full border border-line px-4 py-2 text-sm">Cancel</button></div>}
        <p className="mb-3 text-sm text-ink-soft">Build event-based or email workflows on the canvas. Delete stops future sends and keeps existing history.</p>
        {!visibleWorkflows.length && !visibleEmailFlows.length ? <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-soft">{workflows.length || emailFlows.length ? "No workflows match this folder or search." : "No workflows yet. Start with a site event or an incoming webhook."}</p> : <div className="overflow-x-auto rounded-xl border border-line bg-paper">
          <table className="w-full min-w-[680px] table-fixed border-collapse text-left">
            <thead><tr className="border-b border-line text-sm text-ink-soft"><th scope="col" className="w-[38%] px-4 py-3 font-medium">Name</th><th scope="col" className="w-32 px-4 py-3 font-medium">Status</th><th scope="col" className="px-4 py-3 font-medium">Tools</th><th scope="col" className="w-36 px-4 py-3 text-center font-medium">Actions</th></tr></thead>
            <tbody>
              {visibleWorkflows.map((workflow) => <tr key={`workflow-${workflow.id}`} className="border-b border-line last:border-0 hover:bg-paper-soft/60">
                <td className="px-4 py-3"><a href={`/console/workflows/${workflow.id}`} className="flex min-w-0 items-center gap-3 font-medium text-ink hover:underline"><span className="shrink-0 text-ink"><TriggerIcon /></span><span className="truncate">{workflow.name}</span></a></td>
                <td className="px-4 py-3"><WorkflowToggle on={workflow.status === "active"} label={`${workflow.status === "active" ? "Turn off" : "Turn on"} ${workflow.name}`} disabled={savingKey === `workflow-${workflow.id}`} onToggle={() => void toggleCustomWorkflow(workflow)} /></td>
                <td className="px-4 py-3"><ToolIcons tools={toolsForWorkflow(workflow)} /></td>
                <td className="px-4 py-3"><div className="flex items-center justify-center gap-2"><label className="relative flex h-9 w-10 items-center justify-center rounded-lg border border-line text-ink-soft hover:border-ink" title="Move to folder"><span className="sr-only">Move {workflow.name} to folder</span><svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M12 10v6m-3-3 3 3 3-3"/></svg><select value={workflow.folder_id ?? ""} disabled={savingKey === `workflow-${workflow.id}`} onChange={(event) => void moveToFolder("workflow", workflow.id, event.target.value)} aria-label={`Move ${workflow.name} to folder`} className="absolute h-9 w-10 cursor-pointer opacity-0"><option value="">All workflows</option>{folderList.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button type="button" onClick={() => void deleteCustomWorkflow(workflow)} aria-label={`Delete ${workflow.name}`} title="Delete workflow" className="inline-flex rounded-full border border-red-200 p-2 text-red-700 hover:bg-red-50"><TrashIcon /></button></div></td>
              </tr>)}
              {visibleEmailFlows.map((flow) => <tr key={`email-${flow.id}`} className="border-b border-line last:border-0 hover:bg-paper-soft/60">
                <td className="px-4 py-3"><a href={`/console/workflows/email/${flow.id}`} className="flex min-w-0 items-center gap-3 font-medium text-ink hover:underline"><span className="shrink-0 text-ink"><TriggerIcon /></span><span className="truncate">{flow.name}</span></a></td>
                <td className="px-4 py-3"><WorkflowToggle on={flow.active} label={`${flow.active ? "Turn off" : "Turn on"} ${flow.name}`} disabled={savingKey === `email-${flow.id}`} onToggle={() => void toggleEmailWorkflow(flow)} /></td>
                <td className="px-4 py-3"><ToolIcons tools={[...(flow.has_email_action ? ["email" as const] : []), ...(flow.has_review_request ? ["review" as const] : []), ...(flow.has_wait ? ["wait" as const] : [])]} /></td>
                <td className="px-4 py-3"><div className="flex items-center justify-center gap-2"><label className="relative flex h-9 w-10 items-center justify-center rounded-lg border border-line text-ink-soft hover:border-ink" title="Move to folder"><span className="sr-only">Move {flow.name} to folder</span><svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M12 10v6m-3-3 3 3 3-3"/></svg><select value={flow.folder_id ?? ""} disabled={savingKey === `email-${flow.id}`} onChange={(event) => void moveToFolder("email", flow.id, event.target.value)} aria-label={`Move ${flow.name} to folder`} className="absolute h-9 w-10 cursor-pointer opacity-0"><option value="">All workflows</option>{folderList.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button type="button" onClick={() => void deleteEmailWorkflow(flow)} aria-label={`Delete ${flow.name}`} title="Delete workflow" className="inline-flex rounded-full border border-red-200 p-2 text-red-700 hover:bg-red-50"><TrashIcon /></button></div></td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>

      <section className="border-t border-line pt-6"><h2 className="font-display text-lg font-semibold">Outbound webhooks</h2><p className="mt-1 text-sm text-ink-soft">Send selected site events to external services.</p>{!webhookDestinations.length ? <p className="mt-3 text-sm text-ink-soft">No webhook connections configured.</p> : <div className="mt-3 grid gap-3 lg:grid-cols-2">{webhookDestinations.map((destination) => <a href="/console/webhooks" key={destination.id} className="rounded-2xl border border-line bg-paper p-4 hover:border-ink"><div className="flex justify-between gap-3"><span className="font-medium">{destination.name}</span><span className="text-xs text-ink-soft">{destination.enabled ? "Enabled" : "Paused"}</span></div><p className="mt-2 text-xs text-ink-soft">{destination.event_types.length} subscribed events</p></a>)}</div>}</section>
    </div> : <div className="mt-5 space-y-3">{systemFlows.map((flow) => <article key={flow.id} className="rounded-2xl border border-line bg-paper p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{flow.name}</h3><span className="rounded-full bg-paper-soft px-2.5 py-1 text-xs font-medium text-ink-soft">Critical · platform managed</span></div><div className="overflow-x-auto pb-1"><FlowMap trigger={flow.trigger} actions={flow.actions} /></div></article>)}</div>}
    {dialog}
  </div>;
}
