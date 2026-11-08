"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, Handle, MiniMap, Position, ReactFlow, useReactFlow, type Connection, type Edge, type Node, type NodeProps, type OnEdgesChange, type OnNodesChange } from "@xyflow/react";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import EmailWorkflowBodyEditor from "@/components/EmailWorkflowBodyEditor";

type StepConfig = {
  stepId?: number;
  fromEmail: string;
  subject: string;
  bodyHtml: string;
  conditionType: string;
  conditionStepNodeId: string;
  actionType: "email" | "google_review_request";
  reviewTemplateKey: string;
};
type CanvasData = { kind: "trigger" | "wait" | "email"; label: string; config: Record<string, unknown> };
type CanvasNode = Node<CanvasData, "legacyEmail">;
type EmailOption = { value: string; label: string; subject: string; body: string; fromEmail?: string };
type TriggerOption = { key: string; label: string; courseScoped: boolean };
type Flow = { id: number; name: string; active: boolean; trigger_key: string; course_id: number | null; purpose: string; entry_segment_id: number | null; goal_type: string };
type Course = { id: number; title: string };
type Segment = { id: number; name: string };
type LegacyTestStep = { id: string; label: string; status: "passed" | "failed"; detail: string };

function LegacyNodeView({ id, data, selected }: NodeProps<CanvasNode>) {
  const { deleteElements } = useReactFlow();
  const config = data.config;
  const isTrigger = data.kind === "trigger";
  const isWait = data.kind === "wait";
  const condition = config.conditionType && config.conditionType !== "always" ? String(config.conditionType).replaceAll("_", " ") : "";
  return <div className={`relative min-w-56 rounded-2xl border bg-paper p-4 shadow-sm ${isTrigger ? "border-violet-300 bg-violet-50" : isWait ? "border-orange-300 bg-orange-50" : "border-emerald-300 bg-emerald-50"} ${selected ? "ring-2 ring-ink ring-offset-2" : ""}`}>
    {!isTrigger && <button type="button" aria-label={`Delete ${isWait ? "wait" : "action"} step`} title="Delete node" onClick={(event) => { event.stopPropagation(); void deleteElements({ nodes: [{ id }] }); }} className="nodrag nopan absolute right-2 top-2 rounded-full p-1 text-ink-soft hover:bg-paper hover:text-red-700"><svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 7V4h4v3m-9 0 1 13h12l1-13M10 11v5m4-5v5" /></svg></button>}
    {!isTrigger && <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-paper !bg-ink" />}
    <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-soft">{isTrigger ? "Trigger" : isWait ? "Wait" : config.actionType === "google_review_request" ? "Review request" : "Email"}</p>
    <p className="mt-1 max-w-64 truncate text-sm font-semibold">{data.label}</p>
    {data.kind === "email" && condition && <p className="mt-2 text-xs text-ink-soft">{condition}</p>}
    {isWait && <p className="mt-2 text-xs text-ink-soft">{String(config.duration)} {Number(config.duration) === 1 ? "day" : "days"}</p>}
    <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-paper !bg-ink" />
  </div>;
}

const nodeTypes = { legacyEmail: LegacyNodeView };

export default function LegacyEmailWorkflowCanvas({ flow: initialFlow, graph: initialGraph, triggers, courses, segments, emailTemplates, variables }: {
  flow: Flow;
  graph: { nodes: CanvasNode[]; edges: Edge[] };
  triggers: TriggerOption[];
  courses: Course[];
  segments: Segment[];
  emailTemplates: EmailOption[];
  variables: { token: string; label: string }[];
}) {
  const router = useRouter();
  const [flow, setFlow] = useState(initialFlow);
  const [nodes, setNodes] = useState(initialGraph.nodes);
  const [edges, setEdges] = useState(initialGraph.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number; source: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [testResults, setTestResults] = useState<LegacyTestStep[]>([]);
  const history = useRef<{ past: { flow: Flow; nodes: CanvasNode[]; edges: Edge[] }[]; future: { flow: Flow; nodes: CanvasNode[]; edges: Edge[] }[]; pending: boolean }>({ past: [], future: [], pending: false });
  const [historyState, setHistoryState] = useState({ past: 0, future: 0 });
  const selected = nodes.find((node) => node.id === selectedId) || null;
  const selectedTrigger = triggers.find((trigger) => trigger.key === flow.trigger_key);
  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  function pushHistory() {
    if (history.current.pending) return;
    history.current.pending = true;
    queueMicrotask(() => { history.current.pending = false; });
    history.current.past.push(JSON.parse(JSON.stringify({ flow, nodes, edges })));
    if (history.current.past.length > 30) history.current.past.shift();
    history.current.future = [];
    setHistoryState({ past: history.current.past.length, future: history.current.future.length });
  }
  function undo() {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(JSON.parse(JSON.stringify({ flow, nodes, edges })));
    setFlow(previous.flow); setNodes(previous.nodes); setEdges(previous.edges); setSelectedId(null);
    setHistoryState({ past: history.current.past.length, future: history.current.future.length });
  }
  function redo() {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(JSON.parse(JSON.stringify({ flow, nodes, edges })));
    setFlow(next.flow); setNodes(next.nodes); setEdges(next.edges); setSelectedId(null);
    setHistoryState({ past: history.current.past.length, future: history.current.future.length });
  }
  const onNodesChange: OnNodesChange<CanvasNode> = useCallback((changes) => setNodes((current) => {
    const safeChanges = changes.filter((change) => change.type !== "remove" || current.find((node) => node.id === change.id)?.data.kind !== "trigger");
    if (safeChanges.some((change) => change.type === "remove" || change.type === "add" || change.type === "replace")) pushHistory();
    return applyNodeChanges(safeChanges, current) as CanvasNode[];
  }), [pushHistory]);
  const onEdgesChange: OnEdgesChange<Edge> = useCallback((changes) => { if (changes.some((change) => change.type === "remove" || change.type === "add" || change.type === "replace")) pushHistory(); setEdges((current) => applyEdgeChanges(changes, current)); }, [pushHistory]);
  const onConnect = useCallback((connection: Connection) => { pushHistory(); setEdges((current) => addEdge({ ...connection, id: crypto.randomUUID(), animated: true, style: { stroke: "#525252", strokeWidth: 2 } }, current)); }, [pushHistory]);

  function patchStep(patch: Partial<StepConfig>) {
    if (!selectedId) return;
    pushHistory();
    setNodes((current) => current.map((node) => node.id === selectedId && node.data.kind === "email"
      ? { ...node, data: { ...node.data, label: patch.subject !== undefined ? patch.subject || (patch.actionType === "google_review_request" ? "Google review request" : node.data.label) : node.data.label, config: { ...node.data.config, ...patch } } }
      : node));
  }

  function addStep(actionType: "wait" | "email" | "google_review_request", sourceId: string) {
    pushHistory();
    const source = nodes.find((node) => node.id === sourceId) || nodes[nodes.length - 1];
    const id = `${actionType === "wait" ? "wait" : "new"}-${crypto.randomUUID().slice(0, 8)}`;
    const step: CanvasNode = {
      id, type: "legacyEmail", position: source ? { x: source.position.x + 310, y: source.position.y } : { x: 360, y: 180 },
      data: actionType === "wait"
        ? { kind: "wait", label: "Wait 1 day", config: { duration: 1, unit: "days" } }
        : { kind: "email", label: actionType === "google_review_request" ? "Google review request" : "New email", config: {
          fromEmail: "", subject: "", bodyHtml: "", conditionType: "always", conditionStepNodeId: "",
          actionType, reviewTemplateKey: "google-review-request",
        } },
    };
    setNodes((current) => [...current, step]);
    if (source) setEdges((current) => [...current, { id: `${source.id}-${id}`, source: source.id, target: id, animated: true }]);
    setSelectedId(id); setPicker(null);
  }

  async function save(active = flow.active) {
    setSaving(true); setError(""); setMessage("");
    const response = await fetch(`/api/console/automation/flows/${flow.id}/canvas`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: flow.name,
        active,
        triggerKey: flow.trigger_key,
        courseId: flow.course_id,
        purpose: flow.purpose,
        entrySegmentId: flow.entry_segment_id,
        goalType: flow.goal_type,
        graph,
      }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    setSaving(false);
    if (!response?.ok) { setError(body.error || "Could not save this email journey."); return; }
    setFlow((current) => ({ ...current, active })); setMessage(active ? "Journey is active." : "Saved."); router.refresh();
  }

  function testWorkflow() {
    const results: LegacyTestStep[] = [];
    const trigger = nodes.find((node) => node.data.kind === "trigger");
    if (!trigger) {
      setTestResults([{ id: "trigger", label: "Trigger", status: "failed", detail: "A trigger node is required." }]);
      return;
    }
    results.push({ id: trigger.id, label: trigger.data.label, status: "passed", detail: "Trigger is configured." });
    const pending = edges.filter((edge) => edge.source === trigger.id).map((edge) => edge.target);
    const visited = new Set<string>([trigger.id]);
    while (pending.length && visited.size <= 100) {
      const id = pending.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node) continue;
      if (node.data.kind === "wait") {
        const duration = Number(node.data.config.duration);
        const ready = Number.isInteger(duration) && duration >= 1 && duration <= 365 && node.data.config.unit === "days";
        results.push({ id, label: node.data.label, status: ready ? "passed" : "failed", detail: ready ? `Wait is valid (${duration} days); test did not pause.` : "Wait must be from 1 to 365 whole days." });
      } else if (node.data.kind === "email") {
        const config = node.data.config as StepConfig;
        const review = config.actionType === "google_review_request";
        const ready = review ? ["google-review-request", "google-review-reminder"].includes(config.reviewTemplateKey) : !!config.subject?.trim() && !!config.bodyHtml?.trim();
        const conditionReady = !config.conditionType || config.conditionType === "always" || (!!config.conditionStepNodeId && nodes.some((candidate) => candidate.id === config.conditionStepNodeId && candidate.data.kind === "email"));
        results.push({ id, label: node.data.label, status: ready && conditionReady ? "passed" : "failed", detail: !ready ? "Complete the email subject and body, or choose a review template." : !conditionReady ? "Choose an earlier email to check for opens or clicks." : review ? "Review action is configured; no email was sent." : "Email action is configured; no email was sent." });
      }
      pending.push(...edges.filter((edge) => edge.source === id).map((edge) => edge.target));
    }
    for (const node of nodes) {
      if (!visited.has(node.id)) results.push({ id: node.id, label: node.data.label, status: "failed", detail: "This node is not connected to the trigger." });
    }
    setTestResults(results);
    setMessage(results.some((result) => result.status === "failed") ? "Test found steps that need attention." : "Test finished. No messages were sent.");
  }

  const steps = nodes.filter((node) => node.data.kind === "email");
  const courseScoped = !!selectedTrigger?.courseScoped;

  return <div className="fixed inset-0 z-40 flex h-[100dvh] flex-col bg-paper">
    <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
      <Link href="/console/workflows" className="text-sm text-ink-soft hover:text-ink">← Workflows</Link>
      <input aria-label="Workflow name" value={flow.name} onChange={(event) => setFlow((current) => ({ ...current, name: event.target.value }))} className="w-52 max-w-[35vw] min-w-36 rounded-lg border border-line px-3 py-2 text-sm font-semibold outline-none focus:border-ink" />
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${flow.active ? "bg-emerald-100 text-emerald-800" : "bg-paper-soft text-ink-soft"}`}>{flow.active ? "Active" : "Paused"}</span>
      <span className="ml-auto flex items-center gap-1">
        <button type="button" disabled={historyState.past === 0} onClick={undo} aria-label="Undo" title="Undo" className="rounded-lg border border-line p-2 text-ink disabled:opacity-35"><svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 0 14h-1"/></svg></button>
        <button type="button" disabled={historyState.future === 0} onClick={redo} aria-label="Redo" title="Redo" className="rounded-lg border border-line p-2 text-ink disabled:opacity-35"><svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9h-9a7 7 0 0 0 0 14h1"/></svg></button>
      </span>
      <button type="button" disabled={saving} onClick={() => void save(flow.active)} className="rounded-full border border-line px-4 py-2 text-sm font-medium disabled:opacity-50">Save</button>
      <button type="button" disabled={saving} onClick={testWorkflow} className="rounded-full border border-line px-4 py-2 text-sm font-medium disabled:opacity-50">Test workflow</button>
      <button type="button" disabled={saving} onClick={() => void save(!flow.active)} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50">{flow.active ? "Pause" : "Activate"}</button>
    </header>
    <div className="relative flex min-h-0 flex-1">
      <main className="relative min-w-0 flex-1">
        <div className="absolute left-4 top-4 z-10"><button type="button" onClick={() => setPicker({ x: 20, y: 72, source: selectedId || "trigger" })} className="rounded-full border border-line bg-paper px-3 py-2 text-xs font-medium shadow-sm">+ Add step</button></div>
        {picker && <div className="fixed z-50 w-64 rounded-xl border border-line bg-paper p-2 shadow-xl" style={{ left: picker.x, top: picker.y }}><p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-soft">Choose the next step</p><button type="button" onClick={() => addStep("wait", picker.source)} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-paper-soft">Wait</button><button type="button" onClick={() => addStep("email", picker.source)} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-paper-soft">Send an email</button><button type="button" onClick={() => addStep("google_review_request", picker.source)} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-paper-soft">Request a Google review</button></div>}
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onConnectEnd={(event, connection) => { if (!connection.isValid && connection.fromNode) { const point = "changedTouches" in event ? event.changedTouches[0] : event; setPicker({ x: Math.max(12, Math.min(point.clientX, window.innerWidth - 280)), y: Math.max(12, Math.min(point.clientY, window.innerHeight - 180)), source: connection.fromNode.id }); } }}
          onNodeClick={(_event, node) => { setSelectedId(node.id); setPicker(null); }} onPaneClick={() => { setSelectedId(null); setPicker(null); }} fitView deleteKeyCode={selected && selected.data.kind !== "trigger" ? ["Backspace", "Delete"] : null} proOptions={{ hideAttribution: true }} defaultEdgeOptions={{ animated: true, style: { stroke: "#525252", strokeWidth: 2 } }}>
          <Background color="#d4d4d4" gap={22} size={1} /><MiniMap pannable zoomable nodeStrokeWidth={3} /><Controls />
        </ReactFlow>
        {(message || error) && <div role={error ? "alert" : "status"} className={`absolute bottom-4 left-4 z-10 rounded-xl border bg-paper px-4 py-3 text-sm shadow-sm ${error ? "border-red-300 text-red-700" : "border-green-300 text-green-800"}`}>{error || message}</div>}
      </main>
      <aside className={`${selectedId ? "block" : "hidden xl:block"} absolute inset-y-0 right-0 z-20 w-80 max-w-[90vw] shrink-0 overflow-y-auto border-l border-line bg-paper p-5 shadow-xl xl:static xl:z-auto xl:max-w-none xl:shadow-none`}>
        <div className="mb-4 flex justify-end xl:hidden"><button type="button" onClick={() => setSelectedId(null)} className="rounded-full border border-line px-3 py-1.5 text-xs">Close</button></div>
        {selected?.data.kind === "email" ? <StepSettings node={selected} steps={steps} emailTemplates={emailTemplates} variables={variables} onChange={patchStep} onDelete={() => { pushHistory(); setNodes((current) => current.filter((node) => node.id !== selected.id)); setEdges((current) => current.filter((edge) => edge.source !== selected.id && edge.target !== selected.id)); setSelectedId(null); }} /> : selected?.data.kind === "wait" ? <WaitSettings node={selected} onChange={(patch) => { pushHistory(); const duration = Math.max(1, Math.min(365, Math.floor(Number(patch.duration) || 1))); const label = `Wait ${duration} day${duration === 1 ? "" : "s"}`; setNodes((current) => current.map((node) => node.id === selected.id ? { ...node, data: { ...node.data, label, config: { ...node.data.config, duration, unit: "days" } } } : node)); }} onLabelChange={(label) => { pushHistory(); setNodes((current) => current.map((node) => node.id === selected.id ? { ...node, data: { ...node.data, label } } : node)); }} onDelete={() => { pushHistory(); setNodes((current) => current.filter((node) => node.id !== selected.id)); setEdges((current) => current.filter((edge) => edge.source !== selected.id && edge.target !== selected.id)); setSelectedId(null); }} /> : <div className="space-y-4">
          <p className="text-sm leading-6 text-ink-soft">Select a trigger or action node to edit it. Drag a node output handle onto the canvas to add and connect a step.</p>
          <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Starts when</p><BrandSelect value={flow.trigger_key} onChange={(value) => { const trigger = triggers.find((item) => item.key === value); setFlow((current) => ({ ...current, trigger_key: value, course_id: trigger?.courseScoped ? current.course_id : null })); setNodes((current) => current.map((node) => node.data.kind === "trigger" ? { ...node, data: { ...node.data, label: trigger?.label || value } } : node)); }} options={triggers.map((item) => ({ value: item.key, label: item.label }))} searchable /></div>
          {courseScoped && <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Course</p><BrandSelect value={String(flow.course_id || "")} onChange={(value) => setFlow((current) => ({ ...current, course_id: Number(value) || null }))} options={courses.map((course) => ({ value: String(course.id), label: course.title }))} placeholder="Select a course" searchable /></div>}
          <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Email purpose</p><BrandSelect value={flow.purpose} onChange={(value) => setFlow((current) => ({ ...current, purpose: value }))} options={[{ value: "service", label: "Service / relationship" }, { value: "marketing", label: "Marketing (consent required)" }]} /></div>
          <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Entry segment</p><BrandSelect value={String(flow.entry_segment_id || "")} onChange={(value) => setFlow((current) => ({ ...current, entry_segment_id: Number(value) || null }))} options={[{ value: "", label: "All eligible contacts" }, ...segments.map((segment) => ({ value: String(segment.id), label: segment.name }))]} searchable /></div>
          <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Stop when</p><BrandSelect value={flow.goal_type} onChange={(value) => setFlow((current) => ({ ...current, goal_type: value }))} options={[{ value: "none", label: "Journey completes" }, { value: "course_pro", label: "Learner upgrades to PRO" }, { value: "course_completed", label: "Learner completes the course" }, { value: "community_first_post", label: "Member creates their first post" }]} /></div>
          <div className="border-t border-line pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Journey details</p><p className="mt-2 text-sm">{steps.length} steps · {flow.active ? "Sending" : "Paused"}</p><p className="mt-1 text-xs text-ink-soft">Existing scheduled sends and delivery history remain attached to their email steps.</p></div>
        </div>}
        {testResults.length > 0 && <div className="mt-5 border-t border-line pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Last test · no messages sent</p><div className="mt-3 space-y-2">{testResults.map((result) => <div key={result.id} className="rounded-xl border border-line p-3 text-xs"><div className="flex items-center gap-2"><span className={result.status === "passed" ? "text-emerald-700" : "text-red-700"}>{result.status === "passed" ? "✓" : "!"}</span><span className="font-medium">{result.label}</span></div><p className="mt-1 pl-5 text-ink-soft">{result.detail}</p></div>)}</div></div>}
      </aside>
    </div>
  </div>;
}

function StepSettings({ node, steps, emailTemplates, variables, onChange, onDelete }: { node: CanvasNode; steps: CanvasNode[]; emailTemplates: EmailOption[]; variables: { token: string; label: string }[]; onChange: (patch: Partial<StepConfig>) => void; onDelete: () => void }) {
  const config = node.data.config as StepConfig;
  const field = (label: string, key: keyof StepConfig, placeholder = "") => <label className="block text-xs font-medium text-ink-soft">{label}<input value={String(config[key] ?? "")} onChange={(event) => onChange({ [key]: event.target.value } as Partial<StepConfig>)} placeholder={placeholder} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink" /></label>;
  return <div className="space-y-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{config.actionType === "google_review_request" ? "Review request settings" : "Email settings"}</p>
    <label className="block text-xs font-medium text-ink-soft">Node name<input value={node.data.label} onChange={(event) => onChange({ subject: event.target.value })} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink" /></label>
    <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Action</p><BrandSelect value={config.actionType || "email"} onChange={(value) => onChange({ actionType: value as StepConfig["actionType"] })} options={[{ value: "email", label: "Send an email" }, { value: "google_review_request", label: "Request a Google review" }]} /></div>
    {config.actionType !== "google_review_request" && <>
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Send condition</p><BrandSelect value={config.conditionType || "always"} onChange={(value) => onChange({ conditionType: value, conditionStepNodeId: value === "always" ? "" : config.conditionStepNodeId })} options={[{ value: "always", label: "Always continue" }, { value: "opened", label: "Previous email was opened" }, { value: "not_opened", label: "Previous email was not opened" }, { value: "clicked", label: "Previous email was clicked" }, { value: "not_clicked", label: "Previous email was not clicked" }]} /></div>
      {config.conditionType && config.conditionType !== "always" && <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Check email step</p><BrandSelect value={config.conditionStepNodeId || ""} onChange={(value) => onChange({ conditionStepNodeId: value })} options={steps.filter((step) => step.id !== node.id && Number((step.data.config as StepConfig).stepId || 0) < Number(config.stepId || Number.MAX_SAFE_INTEGER)).map((step) => ({ value: step.id, label: step.data.label || "Email step" }))} placeholder="Choose an earlier email step" searchable /></div>}
    </>}
    {config.actionType === "google_review_request" ? <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Review email</p><BrandSelect value={config.reviewTemplateKey || "google-review-request"} onChange={(value) => onChange({ reviewTemplateKey: value })} options={[{ value: "google-review-request", label: "Initial request" }, { value: "google-review-reminder", label: "Reminder" }]} /></div> : <>
      {field("From address", "fromEmail", "academy@your-domain.com")}
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Copy content from a saved template</p><BrandSelect value="" onChange={(value) => { const template = emailTemplates.find((item) => item.value === value); if (template) onChange({ subject: template.subject, bodyHtml: template.body, ...(template.fromEmail ? { fromEmail: template.fromEmail } : {}) }); }} options={emailTemplates.map((template) => ({ value: template.value, label: template.label }))} placeholder="Choose a template to copy" searchable /></div>
      {field("Subject", "subject", "Email subject")}
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Email body</p><EmailWorkflowBodyEditor value={config.bodyHtml || ""} onChange={(bodyHtml) => onChange({ bodyHtml })} variables={variables} /></div>
    </>}
    <button type="button" onClick={onDelete} className="rounded-full border border-red-300 px-4 py-2 text-sm text-red-700">Remove step</button>
  </div>;
}

function WaitSettings({ node, onChange, onLabelChange, onDelete }: { node: CanvasNode; onChange: (patch: { duration: number }) => void; onLabelChange: (label: string) => void; onDelete: () => void }) {
  const duration = Number(node.data.config.duration) || 1;
  return <div className="space-y-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Wait settings</p>
    <label className="block text-xs font-medium text-ink-soft">Node name<input value={node.data.label} onChange={(event) => onLabelChange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink" /></label>
    <label className="block text-xs font-medium text-ink-soft">Wait for (days)<input type="number" min="1" max="365" step="1" value={duration} onChange={(event) => onChange({ duration: Number(event.target.value) })} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink" /></label>
    <p className="text-xs leading-5 text-ink-soft">Delays are separate workflow steps, so each email action keeps the same settings in every journey.</p>
    <button type="button" onClick={onDelete} className="rounded-full border border-red-300 px-4 py-2 text-sm text-red-700">Remove step</button>
  </div>;
}
