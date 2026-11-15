"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  addEdge, Background, BaseEdge, Controls, EdgeLabelRenderer, getBezierPath, Handle, MiniMap, Position, ReactFlow, reconnectEdge,
  applyEdgeChanges, applyNodeChanges, useReactFlow, type Connection, type Edge, type Node,
  type EdgeProps, type NodeProps, type OnEdgesChange, type OnNodesChange,
} from "@xyflow/react";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import { useConfirm } from "@/components/ConfirmDialog";
import ConsoleEmailBuilder from "@/components/emailBuilder/ConsoleEmailBuilder";
import type { EmailBlock } from "@/lib/emailBlocks";
import { wrapEmailHtml } from "@/lib/emailShell";
import { EMAIL_ATTRIBUTES } from "@/lib/messageVariables";
import { VERIFIED_CONTACT_SOURCES, VERIFIED_CONTACT_SOURCE_OPTIONS, type WorkflowGraph, type WorkflowNodeKind } from "@/lib/workflowGraph";

type CanvasNodeData = { kind: WorkflowNodeKind; label: string; config: Record<string, unknown> };
type CanvasNode = Node<CanvasNodeData, "workflow">;
type CanvasEdge = Edge;
type TriggerOption = { value: string; label: string; description: string };
type EmailTemplateOption = { value: string; label: string; kind: "fixed" | "library"; key: string; subject: string; body: string; critical: boolean };
type WhatsAppTemplateOption = { name: string; language: string; category: string; body: string; variableCount: number };
type CourseOption = { id: number; title: string };
type SegmentOption = { id: number; name: string };
type FormOption = { id: number; name: string };
type Run = { id: number; status: string; error: string | null; created_at: string; finished_at: string | null; legacy?: boolean };
type TestStepResult = { nodeId: string; label: string; status: "passed" | "skipped" | "failed" | "sent"; message: string };
type GraphSnapshot = { nodes: CanvasNode[]; edges: CanvasEdge[]; triggerType: "event" | "webhook"; triggerKey: string };

function editState(value: { name: string; description: string; status: string; triggerType: string; triggerKey: string; nodes: CanvasNode[]; edges: CanvasEdge[] }) {
  return JSON.stringify({
    name: value.name, description: value.description, status: value.status,
    triggerType: value.triggerType, triggerKey: value.triggerKey,
    nodes: value.nodes.map((node) => ({ id: node.id, type: node.type, position: node.position, data: node.data })),
    edges: value.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle })),
  });
}

const kindLabel: Record<WorkflowNodeKind, string> = {
  trigger: "Trigger", condition: "Condition", email_condition: "Email check", wait: "Wait", email: "Email", whatsapp: "WhatsApp", google_review_request: "Google review request", webhook: "Webhook", course_access: "Course access", contact_update: "Update contact", contact_unsubscribe: "Unsubscribe contact", contact_delete: "Remove contact", stop: "End",
};
const kindColor: Record<WorkflowNodeKind, string> = {
  trigger: "border-violet-300 bg-violet-50", condition: "border-amber-300 bg-amber-50",
  email_condition: "border-amber-300 bg-amber-50", wait: "border-orange-300 bg-orange-50", email: "border-blue-300 bg-blue-50", whatsapp: "border-green-300 bg-green-50", google_review_request: "border-blue-300 bg-blue-50",
  webhook: "border-cyan-300 bg-cyan-50", course_access: "border-rose-300 bg-rose-50", contact_update: "border-fuchsia-300 bg-fuchsia-50", contact_unsubscribe: "border-orange-300 bg-orange-50", contact_delete: "border-red-300 bg-red-50", stop: "border-line bg-paper-soft",
};
function WorkflowNodeView({ id, data, selected }: NodeProps<CanvasNode>) {
  const { deleteElements } = useReactFlow();
  return (
    <div className={`relative min-w-52 rounded-2xl border bg-paper p-4 shadow-sm ${kindColor[data.kind]} ${selected ? "ring-2 ring-ink ring-offset-2" : ""}`}>
      {data.kind !== "trigger" && <button type="button" aria-label={`Delete ${kindLabel[data.kind]} node`} title="Delete node" onClick={(event) => { event.stopPropagation(); void deleteElements({ nodes: [{ id }] }); }} className="nodrag nopan absolute right-2 top-2 rounded-full p-1 text-ink-soft hover:bg-paper hover:text-red-700"><svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 7V4h4v3m-9 0 1 13h12l1-13M10 11v5m4-5v5" /></svg></button>}
      {data.kind !== "trigger" && <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-paper !bg-ink" />}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-soft">{kindLabel[data.kind]}</p>
      <p className="mt-1 max-w-56 truncate text-sm font-semibold">{data.label}</p>
      {data.kind === "condition" || data.kind === "email_condition" ? (
        <>
          <Handle id="true" type="source" position={Position.Right} style={{ top: "35%" }} className="!h-3 !w-3 !border-2 !border-paper !bg-emerald-600" />
          <span className="absolute -right-10 top-[27%] text-[10px] font-medium text-emerald-700">Yes</span>
          <Handle id="false" type="source" position={Position.Right} style={{ top: "75%" }} className="!h-3 !w-3 !border-2 !border-paper !bg-red-500" />
          <span className="absolute -right-10 top-[68%] text-[10px] font-medium text-red-600">No</span>
        </>
      ) : (
        <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-paper !bg-ink" />
      )}
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNodeView };

/** A connection line with a delete button at its midpoint. Its ends can
 * also be dragged onto another step (see onReconnect). */
function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd }: EdgeProps) {
  const { deleteElements } = useReactFlow();
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return <>
    <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
    <EdgeLabelRenderer>
      <button type="button" aria-label="Delete connection" title="Delete connection" onClick={(event) => { event.stopPropagation(); void deleteElements({ edges: [{ id }] }); }} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }} className="nodrag nopan absolute flex h-6 w-6 items-center justify-center rounded-full border border-line bg-paper text-ink-soft shadow-sm hover:border-red-300 hover:text-red-700">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 7V4h4v3m-9 0 1 13h12l1-13M10 11v5m4-5v5" /></svg>
      </button>
    </EdgeLabelRenderer>
  </>;
}
const edgeTypes = { deletable: DeletableEdge };

/** Why a connection would break the run, or null if it's sound. `ignoreEdgeId`
 * is the line being moved, which no longer counts once it moves. */
function connectionProblem(connection: { source: string | null; target: string | null; sourceHandle?: string | null }, nodes: CanvasNode[], edges: CanvasEdge[], ignoreEdgeId?: string): string | null {
  const { source, target } = connection;
  if (!source || !target) return "Drop the line on a step.";
  if (source === target) return "A step can't connect to itself.";
  const targetNode = nodes.find((node) => node.id === target);
  const sourceNode = nodes.find((node) => node.id === source);
  if (!targetNode || !sourceNode) return "That step no longer exists.";
  if (targetNode.data.kind === "trigger") return "Nothing can lead into the trigger. It's always the first step.";
  if (sourceNode.data.kind === "stop") return "End finishes the path, so nothing can come after it.";
  if ((sourceNode.data.kind === "condition" || sourceNode.data.kind === "email_condition") && !["true", "false"].includes(String(connection.sourceHandle))) return "Connect from the condition's Yes or No dot.";
  const others = edges.filter((edge) => edge.id !== ignoreEdgeId);
  if (others.some((edge) => edge.source === source && edge.target === target && (edge.sourceHandle || null) === (connection.sourceHandle || null))) return "These steps are already connected.";
  // A loop would make the run repeat steps (and messages) forever.
  const reachable = new Set<string>([target]);
  const stack = [target];
  while (stack.length) {
    const current = stack.pop()!;
    for (const edge of others) if (edge.source === current && !reachable.has(edge.target)) { reachable.add(edge.target); stack.push(edge.target); }
  }
  if (reachable.has(source)) return "That would create a loop: the run would come back to an earlier step and repeat it.";
  return null;
}

/** Sound but worth a second look: a step reached from two paths runs only
 * once per run, on whichever path gets there first. */
function connectionWarning(connection: { source: string | null; target: string | null }, nodes: CanvasNode[], edges: CanvasEdge[], ignoreEdgeId?: string): string {
  const incoming = edges.filter((edge) => edge.id !== ignoreEdgeId && edge.target === connection.target && edge.source !== connection.source);
  if (!incoming.length) return "";
  const label = nodes.find((node) => node.id === connection.target)?.data.label || "This step";
  return `Heads up: "${label}" is now reached from more than one step. It still runs only once per run. If you meant to move it, delete its other connection.`;
}

function flattenFields(value: unknown, prefix: string, out: { path: string; value: string }[] = []) {
  if (out.length >= 80) return out;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) flattenFields(child, prefix ? `${prefix}.${key}` : key, out);
  } else if (prefix) {
    out.push({ path: prefix, value: value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value) });
  }
  return out;
}

/** The fields of the latest real occurrence of an event, n8n-style: click
 * one to copy its {{merge field}} for use in any later step. */
function EventDataPanel({ eventKey, prefix, title, onPick }: { eventKey: string; prefix: string; title: string; onPick?: (path: string) => void }) {
  const [state, setState] = useState<{ key: string; sample: Record<string, unknown> | null; loading: boolean; error: string }>({ key: "", sample: null, loading: false, error: "" });
  const [copied, setCopied] = useState("");
  async function load() {
    setState({ key: eventKey, sample: null, loading: true, error: "" });
    const response = await fetch(`/api/console/workflows/sample-event?eventKey=${encodeURIComponent(eventKey)}`).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    setState({ key: eventKey, sample: body.sample ?? null, loading: false, error: response?.ok ? "" : "Could not load data." });
  }
  const loaded = state.key === eventKey && !state.loading;
  const fields = loaded && state.sample ? flattenFields(state.sample, prefix.replace(/\.$/, "")) : [];
  async function copy(path: string) {
    if (onPick) { onPick(path); setCopied(path); setTimeout(() => setCopied(""), 1500); return; }
    await navigator.clipboard?.writeText(`{{${path}}}`).catch(() => {});
    setCopied(path);
    setTimeout(() => setCopied(""), 1500);
  }
  return <div className="rounded-xl border border-line p-3">
    <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-ink">{title}</p><button type="button" disabled={!eventKey || state.loading} onClick={() => void load()} className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium hover:border-ink disabled:opacity-50">{state.loading ? "Loading…" : loaded ? "Refresh" : "Load latest"}</button></div>
    {!loaded ? <p className="mt-2 text-[11px] leading-4 text-ink-soft">Shows the fields from the most recent real event, so you can see exactly what this step receives.</p>
      : state.error ? <p className="mt-2 text-[11px] text-red-700">{state.error}</p>
      : !fields.length ? <p className="mt-2 text-[11px] leading-4 text-ink-soft">This event hasn&apos;t happened on the site yet. Trigger it once (e.g. submit a test tool), then load again.</p>
      : <><p className="mt-2 text-[11px] leading-4 text-ink-soft">{onPick ? "Click a field to check it in this condition." : "Click a field to copy it with curly brackets, then paste it into a subject, body or value."}</p>
        <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">{fields.map((field) => <button key={field.path} type="button" onClick={() => void copy(field.path)} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-paper-soft"><span className="block font-mono text-[11px] text-ink">{copied === field.path ? (onPick ? "Selected" : "Copied!") : onPick ? field.path : `{{${field.path}}}`}</span><span className="block truncate text-[11px] text-ink-soft">{field.value || "(empty)"}</span></button>)}</div></>}
  </div>;
}

function courseEvent(value: string) {
  return ["course.enrolled", "course.upgraded", "course.revoked", "course.completed", "course.inactivity", "payment.succeeded", "payment.failed"].includes(value);
}

function initialNodes(graph: WorkflowGraph): CanvasNode[] {
  return graph.nodes as CanvasNode[];
}
function initialEdges(graph: WorkflowGraph): CanvasEdge[] {
  return graph.edges as CanvasEdge[];
}

export default function WorkflowCanvas({
  workflow: initialWorkflow,
  triggers,
  initialRuns,
  emailTemplates,
  whatsappTemplates,
  courses,
  segments,
  forms,
  fromAddresses,
  initialTestEmail,
  businessName,
  businessAddress,
}: {
  workflow: { id: number; name: string; description: string; status: "draft" | "active" | "paused"; trigger_type: "event" | "webhook"; trigger_key: string | null; graph: WorkflowGraph };
  triggers: TriggerOption[];
  initialRuns: Run[];
  emailTemplates: EmailTemplateOption[];
  whatsappTemplates: WhatsAppTemplateOption[];
  courses: CourseOption[];
  segments: SegmentOption[];
  forms: FormOption[];
  fromAddresses: { value: string; label: string }[];
  initialTestEmail: string;
  businessName: string;
  businessAddress: string;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [name, setName] = useState(initialWorkflow.name);
  const [description, setDescription] = useState(initialWorkflow.description);
  const [triggerType, setTriggerType] = useState<"event" | "webhook">(initialWorkflow.trigger_type);
  const [triggerKey, setTriggerKey] = useState(initialWorkflow.trigger_key || triggers[0]?.value || "");
  const [nodes, setNodes] = useState(initialNodes(initialWorkflow.graph));
  const [edges, setEdges] = useState(initialEdges(initialWorkflow.graph));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState(initialWorkflow.status);
  const [runs] = useState(initialRuns);
  const [testResults, setTestResults] = useState<TestStepResult[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const [testPrompt, setTestPrompt] = useState(false);
  const [testEmail, setTestEmail] = useState(initialTestEmail);
  const [testPhone, setTestPhone] = useState("");
  const [useRealEvent, setUseRealEvent] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [exitPrompt, setExitPrompt] = useState(false);
  const history = useRef<{ past: GraphSnapshot[]; future: GraphSnapshot[] }>({ past: [], future: [] });
  const historyCapturePending = useRef(false);
  const skipEdgeRemoveCaptureUntil = useRef(0);
  const [historyState, setHistoryState] = useState({ past: 0, future: 0 });
  const [actionPicker, setActionPicker] = useState<{ x: number; y: number; source: string; sourceHandle: string | null } | null>(null);
  const [composerNodeId, setComposerNodeId] = useState<string | null>(null);

  const snapshot = (): GraphSnapshot => JSON.parse(JSON.stringify({ nodes, edges, triggerType, triggerKey }));
  function pushHistory() {
    if (historyCapturePending.current) return;
    historyCapturePending.current = true;
    queueMicrotask(() => { historyCapturePending.current = false; });
    history.current.past.push(snapshot());
    if (history.current.past.length > 30) history.current.past.shift();
    history.current.future = [];
    setHistoryState({ past: history.current.past.length, future: history.current.future.length });
  }
  function restoreSnapshot(value: GraphSnapshot) {
    setNodes(value.nodes);
    setEdges(value.edges);
    setTriggerType(value.triggerType);
    setTriggerKey(value.triggerKey);
  }
  function undo() {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(snapshot());
    restoreSnapshot(previous);
    setSelectedId(null);
    setHistoryState({ past: history.current.past.length, future: history.current.future.length });
  }
  function redo() {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(snapshot());
    restoreSnapshot(next);
    setSelectedId(null);
    setHistoryState({ past: history.current.past.length, future: history.current.future.length });
  }
  const [savedState, setSavedState] = useState(() => editState({
    name: initialWorkflow.name, description: initialWorkflow.description, status: initialWorkflow.status,
    triggerType: initialWorkflow.trigger_type, triggerKey: initialWorkflow.trigger_key || triggers[0]?.value || "",
    nodes: initialNodes(initialWorkflow.graph), edges: initialEdges(initialWorkflow.graph),
  }));
  const isDirty = editState({ name, description, status, triggerType, triggerKey, nodes, edges }) !== savedState;

  const selectedNode = nodes.find((node) => node.id === selectedId) || null;
  const composerNode = nodes.find((node) => node.id === composerNodeId && node.data.kind === "email") || null;
  const onNodesChange: OnNodesChange<CanvasNode> = useCallback((changes) => {
    const safeChanges = changes.filter((change) => change.type !== "remove" || nodes.find((node) => node.id === change.id)?.data.kind !== "trigger");
    if (safeChanges.some((change) => change.type === "remove")) skipEdgeRemoveCaptureUntil.current = Date.now() + 100;
    if (safeChanges.some((change) => change.type === "remove" || change.type === "add" || change.type === "replace")) pushHistory();
    setNodes((current) => applyNodeChanges(safeChanges, current) as CanvasNode[]);
  }, [nodes, edges, triggerType, triggerKey]);
  const onEdgesChange: OnEdgesChange<CanvasEdge> = useCallback((changes) => {
    const hasRemove = changes.some((change) => change.type === "remove");
    if (changes.some((change) => change.type === "add" || change.type === "replace") || (hasRemove && Date.now() > skipEdgeRemoveCaptureUntil.current)) pushHistory();
    setEdges((current) => applyEdgeChanges(changes, current));
  }, [nodes, edges, triggerType, triggerKey]);
  const onConnect = useCallback((connection: Connection) => {
    const problem = connectionProblem(connection, nodes, edges);
    if (problem) { setMessage(""); setError(problem); return; }
    setError(""); setMessage(connectionWarning(connection, nodes, edges));
    pushHistory();
    setEdges((current) => addEdge({ ...connection, id: crypto.randomUUID(), animated: true, style: { stroke: "#525252", strokeWidth: 2 } }, current));
  }, [nodes, edges, triggerType, triggerKey]);

  const onReconnect = useCallback((oldEdge: CanvasEdge, connection: Connection) => {
    const problem = connectionProblem(connection, nodes, edges, oldEdge.id);
    if (problem) { setMessage(""); setError(problem); return; }
    setError(""); setMessage(connectionWarning(connection, nodes, edges, oldEdge.id));
    pushHistory();
    setEdges((current) => reconnectEdge(oldEdge, connection, current));
  }, [nodes, edges, triggerType, triggerKey]);
  // Display only: every line gets the delete button. Not saved with the graph.
  const displayEdges = useMemo(() => edges.map((edge) => ({ ...edge, type: "deletable" })), [edges]);

  const graph: WorkflowGraph = useMemo(() => ({ nodes, edges }), [nodes, edges]);

  function updateSelected(patch: Partial<CanvasNodeData>) {
    if (!selectedId) return;
    pushHistory();
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, ...patch } } : node));
  }

  function changeTriggerKey(value: string) {
    pushHistory();
    setTriggerKey(value);
    const label = triggers.find((trigger) => trigger.value === value)?.label || "Event trigger";
    setNodes((current) => current.map((node) => node.data.kind === "trigger"
      ? { ...node, data: { ...node.data, label, config: {
        ...node.data.config,
        triggerType: "event",
        triggerKey: value,
        source: value === "contact.verified" ? String(node.data.config.source || "") : undefined,
        ...(value === "custom_form.submitted"
          ? { formId: String(node.data.config.formId || "") }
          : { formId: undefined }),
        ...(courseEvent(value) ? {
          courseId: String(node.data.config.courseId || ""),
          ...(value === "course.inactivity" ? { inactiveDays: Math.max(1, Math.min(365, Number(node.data.config.inactiveDays) || 3)) } : {}),
        } : { courseId: undefined, inactiveDays: undefined }),
      } } }
      : node));
  }

  function changeTriggerType(value: "event" | "webhook") {
    pushHistory();
    setTriggerType(value);
    const label = value === "webhook" ? "Incoming webhook" : triggers.find((trigger) => trigger.value === triggerKey)?.label || "Event trigger";
    setNodes((current) => current.map((node) => node.data.kind === "trigger"
      ? { ...node, data: { ...node.data, label, config: { ...node.data.config, triggerType: value, triggerKey: value === "event" ? triggerKey : null } } }
      : node));
  }

  function addNode(kind: Exclude<WorkflowNodeKind, "trigger">, sourceId?: string, sourceHandle?: string | null) {
    pushHistory();
    const id = `${kind}-${crypto.randomUUID().slice(0, 8)}`;
    const config: Record<string, unknown> = kind === "condition"
      ? triggerKey === "directory_tool.reviewed"
        ? { field: "data.status", operator: "equals", value: "published" }
        : { field: "data.phone", operator: "exists", value: "" }
      : kind === "email_condition"
        ? { condition: "opened", emailNodeId: "", testEngagement: "opened" }
      : kind === "google_review_request"
        ? { templateKey: "google-review-request" }
      : kind === "wait"
        ? { duration: 1, unit: "days" }
      : kind === "email"
        ? { to: "{{contact.email}}", from: fromAddresses.find((item) => item.label.startsWith("Academy"))?.value || fromAddresses[0]?.value || "", contentMode: "template", templateKind: "library", templateKey: "", subject: "", body: "", messageType: "transactional" }
        : kind === "whatsapp"
          ? { phone: "{{contact.phone}}", templateName: "", languageCode: "en", variables: [], messageType: "transactional" }
          : kind === "webhook"
            ? { url: "" }
            : kind === "course_access"
              ? { courseId: "", tier: "free", email: "{{contact.email}}" }
              : kind === "contact_update"
                ? { field: "name", value: "{{contact.name}}" }
              : kind === "contact_unsubscribe"
                ? {}
              : kind === "contact_delete"
                ? { confirm: false }
            : {};
    const source = sourceId ? nodes.find((node) => node.id === sourceId) : null;
    const base = source || nodes.find((node) => node.id === selectedId) || nodes[nodes.length - 1];
    const node: CanvasNode = {
      id, type: "workflow", position: base ? { x: base.position.x + 280, y: base.position.y + (kind === "condition" ? 50 : 0) } : { x: 320, y: 180 },
      data: { kind, label: kindLabel[kind], config },
    };
    setNodes((current) => [...current, node]);
    if (base && base.data.kind !== "condition") {
      setEdges((current) => [...current, { id: `${base.id}-${id}`, source: base.id, target: id, sourceHandle: sourceHandle || undefined, animated: true }]);
    } else if (base && sourceHandle) {
      setEdges((current) => [...current, { id: `${base.id}-${id}`, source: base.id, target: id, sourceHandle, animated: true }]);
    }
    setSelectedId(id);
    setActionPicker(null);
  }

  function openActionPicker(source = selectedId || nodes.find((node) => node.data.kind === "trigger")?.id || "trigger") {
    setActionPicker({ x: 24, y: 72, source, sourceHandle: null });
  }

  async function save(nextStatus: "draft" | "active" | "paused" = status): Promise<boolean> {
    setSaving(true); setError(""); setMessage("");
    const response = await fetch(`/api/console/workflows/${initialWorkflow.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, triggerType, triggerKey: triggerType === "event" ? triggerKey : undefined, graph, status: nextStatus }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    setSaving(false);
    if (!response?.ok) { setError(body.error || "Could not save this workflow."); return false; }
    setStatus(body.workflow.status);
    setSavedState(editState({ name, description, status: body.workflow.status, triggerType, triggerKey, nodes, edges }));
    setMessage(nextStatus === "active" ? "Workflow is active." : "Saved.");
    router.refresh();
    return true;
  }

  async function saveComposerEmail(next: { subject: string; blocks: EmailBlock[] | null; bodyHtml: string }): Promise<{ ok: boolean; error?: string }> {
    if (!composerNode) return { ok: false, error: "Email step no longer exists." };
    if (!next.subject.trim() || !next.bodyHtml.trim()) return { ok: false, error: "Add a subject and email body before saving." };
    const nextNodes = nodes.map((node) => node.id === composerNode.id
      ? { ...node, data: { ...node.data, config: { ...node.data.config, contentMode: "custom", subject: next.subject, body: next.bodyHtml, blocks: next.blocks } } }
      : node);
    const response = await fetch(`/api/console/workflows/${initialWorkflow.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, triggerType, triggerKey: triggerType === "event" ? triggerKey : undefined,
        graph: { nodes: nextNodes, edges }, status }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    if (!response?.ok) return { ok: false, error: body.error || "Could not save this workflow email." };
    setNodes(nextNodes);
    setStatus(body.workflow.status);
    setSavedState(editState({ name, description, status: body.workflow.status, triggerType, triggerKey, nodes: nextNodes, edges }));
    setMessage("Workflow email saved.");
    return { ok: true };
  }

  async function rotateWebhook() {
    setError(""); setWebhookUrl("");
    if (triggerType !== initialWorkflow.trigger_type || triggerKey !== (initialWorkflow.trigger_key || "")) {
      if (!(await save(status))) return;
    }
    const response = await fetch(`/api/console/workflows/${initialWorkflow.id}/rotate-webhook`, { method: "POST" }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    if (!response?.ok) { setError(body.error || "Could not create a webhook URL."); return; }
    setWebhookUrl(`${window.location.origin}${body.webhookUrl}`);
  }

  async function retryRun(runId: number) {
    const response = await fetch(`/api/console/workflows/${initialWorkflow.id}/runs/${runId}/retry`, { method: "POST" });
    if (response.ok) router.refresh();
    else setError("Could not retry this workflow run.");
  }

  async function runWorkflowTest() {
    setTestRunning(true); setError(""); setMessage(""); setTestResults([]);
    const response = await fetch(`/api/console/workflows/${initialWorkflow.id}/test`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graph, triggerType, triggerKey, name, testEmail, testPhone, useRealEvent: triggerType === "event" && useRealEvent }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    setTestRunning(false);
    setTestPrompt(false);
    setTestResults(body.steps || []);
    if (!response?.ok || body.error) setError(body.error || "Could not test this workflow.");
    else setMessage("Test finished. Messages were sent to the test recipient; waits were skipped.");
  }

  async function deleteWorkflow() {
    if (!(await confirm({ message: "Delete this workflow? It will stop receiving new events and queued runs will be canceled. Run history is kept in the database for recovery. Any run already processing may finish. The workflow will disappear from the console.", confirmLabel: "Delete workflow" }))) return;
    const response = await fetch(`/api/console/workflows/${initialWorkflow.id}`, { method: "DELETE" });
    if (response.ok) router.push("/console/workflows");
    else setError("Could not delete this workflow.");
  }

  function requestBack() {
    if (isDirty) setExitPrompt(true);
    else router.push("/console/workflows");
  }

  async function saveAndExit() {
    if (await save()) router.push("/console/workflows");
  }

  return (
    <div className="fixed inset-0 z-40 flex h-[100dvh] flex-col bg-paper">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
        <button type="button" onClick={requestBack} className="text-sm text-ink-soft hover:text-ink">← Workflows</button>
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Workflow name" placeholder="Workflow name" className="w-36 shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-semibold outline-none focus:border-ink sm:w-52" />
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-paper-soft text-ink-soft"}`}>{status}</span>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" disabled={historyState.past === 0} onClick={undo} aria-label="Undo" title="Undo" className="rounded-lg border border-line p-2 text-ink disabled:opacity-35"><svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 0 14h-1"/></svg></button>
          <a href={`/api/console/workflows/${initialWorkflow.id}/export`} download onClick={() => { if (isDirty) setMessage("Shared the last saved version. Save first to include your latest edits."); }} aria-label="Share workflow" title="Share: download a file another OpenCloudCRM can import" className="order-last ml-1 rounded-lg border border-line p-2 text-ink"><svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6"/></svg></a>
          <button type="button" disabled={historyState.future === 0} onClick={redo} aria-label="Redo" title="Redo" className="rounded-lg border border-line p-2 text-ink disabled:opacity-35"><svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9h-9a7 7 0 0 0 0 14h1"/></svg></button>
        </span>
        <button type="button" disabled={saving} onClick={() => void save()} className="rounded-full border border-line px-4 py-2 text-sm font-medium disabled:opacity-50">Save</button>
        <button type="button" disabled={saving || testRunning} onClick={() => setTestPrompt(true)} className="rounded-full border border-line px-4 py-2 text-sm font-medium disabled:opacity-50">Test workflow</button>
        {status === "active" ? (
          <button type="button" disabled={saving} onClick={() => void save("paused")} className="rounded-full border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 disabled:opacity-50">Pause</button>
        ) : (
          <button type="button" disabled={saving} onClick={() => void save("active")} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50">Activate</button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <div className="absolute left-4 top-4 z-10 flex max-w-[calc(100%-2rem)] gap-2 rounded-xl border border-line bg-paper/95 p-2 shadow-sm backdrop-blur">
            <button type="button" onClick={() => openActionPicker()} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink">+ Add step</button>
          </div>
          {actionPicker && <div className="fixed z-50 w-64 rounded-xl border border-line bg-paper p-2 shadow-xl" style={{ left: actionPicker.x, top: actionPicker.y }}>
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-soft">Choose the next step</p>
            {(["condition", "email_condition", "wait", "email", "whatsapp", "google_review_request", "webhook", "course_access", "contact_update", "contact_unsubscribe", "contact_delete", "stop"] as const).map((kind) => <button key={kind} type="button" onClick={() => addNode(kind, actionPicker.source, actionPicker.sourceHandle)} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-paper-soft">{kindLabel[kind]}</button>)}
          </div>}
          <ReactFlow
            nodes={nodes} edges={displayEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onReconnect={onReconnect} edgesReconnectable
            onNodeDragStart={pushHistory}
            onConnectEnd={(event, connectionState) => {
              if (!connectionState.isValid && connectionState.fromNode) {
                const point = "changedTouches" in event ? event.changedTouches[0] : event;
                setActionPicker({ x: Math.max(12, Math.min(point.clientX, window.innerWidth - 280)), y: Math.max(12, Math.min(point.clientY, window.innerHeight - 310)), source: connectionState.fromNode.id, sourceHandle: connectionState.fromHandle?.id || null });
              }
            }}
            onNodeClick={(_event, node) => { setSelectedId(node.id); setActionPicker(null); }} onPaneClick={() => { setSelectedId(null); setActionPicker(null); }}
            fitView deleteKeyCode={["Backspace", "Delete"]} proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ animated: true, style: { stroke: "#525252", strokeWidth: 2 } }}
          >
            <Background color="#d4d4d4" gap={22} size={1} />
            <MiniMap pannable zoomable nodeStrokeWidth={3} />
            <Controls />
          </ReactFlow>
          {(message || error) && <div role={error ? "alert" : "status"} className={`absolute bottom-4 left-4 z-10 rounded-xl border bg-paper px-4 py-3 text-sm shadow-sm ${error ? "border-red-300 text-red-700" : "border-green-300 text-green-800"}`}>{error || message}</div>}
        </main>

        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-line bg-paper p-5 xl:block">
          {selectedNode ? (
            <NodeSettings node={selectedNode} eventWaitKey={String(nodes.find((item) => item.data.kind === "wait" && item.data.config.mode === "event")?.data.config.eventKey || "")} emailNodes={nodes.filter((item) => item.data.kind === "email")} onChange={updateSelected} onOpenComposer={() => setComposerNodeId(selectedNode.id)} triggerType={triggerType} triggerKey={triggerKey} triggers={triggers} onTriggerTypeChange={changeTriggerType} onTriggerKeyChange={changeTriggerKey} onRotateWebhook={() => void rotateWebhook()} webhookUrl={webhookUrl} emailTemplates={emailTemplates} whatsappTemplates={whatsappTemplates} courses={courses} segments={segments} forms={forms} fromAddresses={fromAddresses} />
          ) : (
            <div className="space-y-5">
              <p className="text-sm leading-6 text-ink-soft">Select a node to configure its trigger or action. Drag a node&apos;s output handle onto the canvas to add and connect the next step.</p>
              <label className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-sm font-normal normal-case outline-none focus:border-ink" /></label>
              <div className="border-t border-line pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Recent runs</p>
                <p className="mt-1 text-[11px] leading-4 text-ink-soft">Test workflow sends real messages to the test recipients and skips Wait nodes.</p>
                {!runs.length ? <p className="mt-2 text-sm text-ink-soft">No runs yet.</p> : <div className="mt-3 space-y-2">{runs.slice(0, 8).map((run) => <div key={`${run.legacy ? "legacy" : "visual"}-${run.id}`} className="rounded-xl border border-line p-3 text-xs"><div className="flex justify-between gap-2"><span>{run.legacy ? "Previous run" : "Run"} #{run.id}</span><span className={run.status === "failed" ? "text-red-600" : "text-ink-soft"}>{run.status}</span></div>{run.error && <p className="mt-2 text-red-600">{run.error}</p>}{run.status === "failed" && !run.legacy && <button type="button" onClick={() => void retryRun(run.id)} className="mt-2 rounded-full border border-line px-2.5 py-1 text-xs">Retry failed run</button>}</div>)}</div>}
              </div>
              <button type="button" onClick={() => void deleteWorkflow()} className="rounded-full border border-red-300 px-4 py-2 text-sm text-red-700">Delete workflow</button>
            </div>
          )}
          {testResults.length > 0 && <div className="mt-5 border-t border-line pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Last test</p><div className="mt-3 space-y-2">{testResults.map((step) => <div key={step.nodeId} className="rounded-xl border border-line p-3 text-xs"><div className="flex items-center gap-2"><span className={step.status === "failed" ? "text-red-700" : step.status === "sent" || step.status === "passed" ? "text-emerald-700" : "text-ink-soft"}>{step.status === "failed" ? "!" : step.status === "skipped" ? "–" : "✓"}</span><span className="font-medium">{step.label}</span><span className="ml-auto text-ink-soft">{step.status}</span></div><p className="mt-1 pl-5 text-ink-soft">{step.message}</p></div>)}</div></div>}
        </aside>
      </div>
      <div className="border-t border-line bg-paper px-4 py-2 text-xs text-ink-soft xl:hidden">Select a node to edit its settings on larger screens.</div>
      {composerNode && <div className="fixed inset-0 z-[80] bg-paper">
        <ConsoleEmailBuilder
          key={composerNode.id}
          initialSubject={String(composerNode.data.config.subject || "")}
          initialBlocks={Array.isArray(composerNode.data.config.blocks) ? composerNode.data.config.blocks as EmailBlock[] : []}
          initialBodyHtml={String(composerNode.data.config.body || "")}
          variables={EMAIL_ATTRIBUTES}
          backHref={`/console/workflows/${initialWorkflow.id}`}
          backLabel="Back to workflow"
          onBack={() => setComposerNodeId(null)}
          onSaved={() => setComposerNodeId(null)}
          businessName={businessName}
          businessAddress={businessAddress}
          onSave={saveComposerEmail}
        />
      </div>}
      {testPrompt && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/50 px-5"><section role="dialog" aria-modal="true" aria-labelledby="workflow-test-title" className="w-full max-w-md rounded-2xl border border-line bg-paper p-6 shadow-xl"><h2 id="workflow-test-title" className="font-display text-lg font-semibold">Run workflow test</h2><p className="mt-2 text-sm leading-6 text-ink-soft">This starts at the trigger, skips Wait nodes, and sends real messages to these test recipients. Course access, contact unsubscribe, and contact removal actions are held to protect real records.</p>{nodes.some((node) => node.data.kind === "email") && <label className="mt-4 block text-sm font-medium">Test email<input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink" /></label>}{nodes.some((node) => node.data.kind === "whatsapp") && <label className="mt-4 block text-sm font-medium">Test WhatsApp number<input type="tel" value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="Include country code" className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink" /></label>}{triggerType === "event" && <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={useRealEvent} onChange={(event) => setUseRealEvent(event.target.checked)} className="mt-1 h-4 w-4" /><span><span className="font-medium">Use the latest real event</span><span className="block text-xs leading-5 text-ink-soft">Runs on the data of the last time this event actually happened (e.g. your last tool submission), so conditions take the path real data would. Messages still go only to the test recipient above.</span></span></label>}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setTestPrompt(false)} className="rounded-full border border-line px-4 py-2 text-sm">Cancel</button><button type="button" disabled={testRunning} onClick={() => void runWorkflowTest()} className="rounded-full bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50">{testRunning ? "Running…" : "Send test"}</button></div></section></div>}
      {exitPrompt && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/50 px-5"><section role="alertdialog" aria-modal="true" aria-labelledby="workflow-exit-title" className="w-full max-w-md rounded-2xl border border-line bg-paper p-6 shadow-xl"><h2 id="workflow-exit-title" className="font-display text-lg font-semibold">Leave this workflow?</h2><p className="mt-2 text-sm leading-6 text-ink-soft">You have unsaved changes. Save them before leaving, or exit and discard those edits.</p><div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setExitPrompt(false)} className="rounded-full border border-line px-4 py-2 text-sm font-medium">Cancel</button><button type="button" onClick={() => router.push("/console/workflows")} className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Exit without saving</button><button type="button" disabled={saving} onClick={() => void saveAndExit()} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50">{saving ? "Saving…" : "Save and exit"}</button></div></section></div>}
      {dialog}
    </div>
  );
}

function NodeSettings({ node, eventWaitKey, emailNodes, onChange, onOpenComposer, triggerType, triggerKey, triggers, onTriggerTypeChange, onTriggerKeyChange, onRotateWebhook, webhookUrl, emailTemplates, whatsappTemplates, courses, segments: _segments, forms, fromAddresses }: {
  node: CanvasNode;
  eventWaitKey: string;
  emailNodes: CanvasNode[];
  onChange: (patch: Partial<CanvasNodeData>) => void;
  onOpenComposer: () => void;
  triggerType: "event" | "webhook";
  triggerKey: string;
  triggers: TriggerOption[];
  onTriggerTypeChange: (value: "event" | "webhook") => void;
  onTriggerKeyChange: (value: string) => void;
  onRotateWebhook: () => void;
  webhookUrl: string;
  emailTemplates: EmailTemplateOption[];
  whatsappTemplates: WhatsAppTemplateOption[];
  courses: CourseOption[];
  segments: SegmentOption[];
  forms: FormOption[];
  fromAddresses: { value: string; label: string }[];
}) {
  const config = node.data.config;
  const [showEmailPreview, setShowEmailPreview] = useState(true);
  const set = (key: string, value: unknown) => onChange({ config: { ...config, [key]: value } });
  const field = (label: string, key: string, placeholder = "") => (
    <label className="block text-xs font-medium text-ink-soft">{label}<input value={String(config[key] ?? "")} onChange={(event) => set(key, event.target.value)} placeholder={placeholder} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink" /></label>
  );
  return <div className="space-y-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{kindLabel[node.data.kind]} settings</p>
    {node.data.kind !== "trigger" && <label className="block text-xs font-medium text-ink-soft">Node name<input value={node.data.label} onChange={(event) => onChange({ label: event.target.value })} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink" /></label>}
    {node.data.kind === "trigger" && <>
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Start when</p><BrandSelect value={triggerType} onChange={(value) => onTriggerTypeChange(value as "event" | "webhook")} options={[{ value: "event", label: "A site event occurs" }, { value: "webhook", label: "An external app calls a webhook" }]} /></div>
      {triggerType === "event" ? <>
        <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Site event</p><BrandSelect value={triggerKey} onChange={onTriggerKeyChange} options={[...triggers, ...(triggerKey && !triggers.some((trigger) => trigger.value === triggerKey) ? [{ value: triggerKey, label: node.data.label, description: "Existing workflow event" }] : [])].map((trigger) => ({ value: trigger.value, label: trigger.label }))} searchable searchPlaceholder="Find an event" /></div>
        {triggerKey === "contact.verified" && <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Source</p><BrandSelect value={String(config.source || "")} onChange={(value) => set("source", value)} options={[{ value: "", label: "Any verified source" }, ...VERIFIED_CONTACT_SOURCE_OPTIONS, ...VERIFIED_CONTACT_SOURCES.filter((source) => source.value === config.source)]} searchable placeholder="Any verified source" /></div>}
        {courseEvent(triggerKey) && <>
          <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Course</p><BrandSelect value={String(config.courseId || "")} onChange={(value) => set("courseId", value)} options={[{ value: "", label: "Any course" }, ...courses.map((course) => ({ value: String(course.id), label: course.title }))]} searchable placeholder="Any course" /></div>
        </>}
        {triggerKey === "custom_form.submitted" && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-soft">Form</p>
            <BrandSelect value={String(config.formId || "")} onChange={(value) => set("formId", value)} options={[{ value: "", label: "Any form" }, ...forms.map((form) => ({ value: String(form.id), label: form.name }))]} searchable placeholder="Any form" />
            <p className="mt-1.5 text-xs leading-5 text-ink-soft">Leave on &quot;Any form&quot; to run for every form submission. Choosing one form means only that form&apos;s submissions enter this workflow -- the same way a course trigger can be narrowed to one course.</p>
          </div>
        )}
        {triggerKey === "course.inactivity" && <>
          <label className="block text-xs font-medium text-ink-soft">Inactive for at least (days)<input type="number" min={1} max={365} step={1} value={String(config.inactiveDays ?? 3)} onChange={(event) => set("inactiveDays", Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink" /></label>
          <p className="text-xs leading-5 text-ink-soft">The course inactivity event is checked against the learner&apos;s last activity before this workflow starts. Add a Wait node for any additional reminder delay.</p>
        </>}
        {triggers.find((trigger) => trigger.value === triggerKey)?.description && <p className="text-xs leading-5 text-ink-soft">{triggers.find((trigger) => trigger.value === triggerKey)?.description}</p>}
        {triggerKey && <EventDataPanel eventKey={triggerKey} prefix="" title="Data this trigger sends" />}
      </> : <div className="space-y-3"><p className="text-xs leading-5 text-ink-soft">Send a JSON POST request to start this workflow.</p><button type="button" onClick={onRotateWebhook} className="rounded-full border border-line px-3 py-2 text-xs font-medium">Create or rotate endpoint</button></div>}
      {webhookUrl && triggerType === "webhook" && <div><p className="text-xs text-ink-soft">Copy this URL now. It is shown only once.</p><input readOnly value={webhookUrl} className="mt-2 w-full rounded-lg border border-line bg-paper-soft px-3 py-2 text-xs" /></div>}
    </>}
    {node.data.kind === "condition" && <>
      {triggerKey === "directory_tool.reviewed"
        ? <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Tool review field</p><BrandSelect value={String(config.field || "")} onChange={(value) => set("field", value)} options={[{ value: "data.status", label: "Review status" }, { value: "data.pricing_type", label: "Pricing type" }, { value: "data.website_url", label: "Tool website" }, { value: "data.note", label: "Review note" }]} placeholder="Choose a field" /></div>
        : <div><label className="block text-xs font-medium text-ink-soft">Field to check<input value={String(config.field ?? "")} onChange={(event) => set("field", event.target.value.replace(/[{}s]/g, ""))} placeholder="data.listing_tier" className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-mono text-sm text-ink outline-none focus:border-ink" /></label><p className="mt-1.5 text-[11px] leading-4 text-ink-soft">The field's name only, no curly brackets. Easiest: click a field under &quot;Data you can use&quot; below to fill this in.</p></div>}
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Rule</p><BrandSelect value={String(config.operator || "exists")} onChange={(value) => set("operator", value)} options={[{ value: "exists", label: "Has a value" }, { value: "missing", label: "Is empty" }, { value: "equals", label: "Equals" }, { value: "not_equals", label: "Does not equal" }, { value: "contains", label: "Contains" }, { value: "greater_than", label: "Greater than" }, { value: "less_than", label: "Less than" }]} /></div>
      {triggerKey === "directory_tool.reviewed" && config.field === "data.status" && ["equals", "not_equals"].includes(String(config.operator))
        ? <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Review status</p><BrandSelect value={String(config.value || "")} onChange={(value) => set("value", value)} options={[{ value: "published", label: "Published" }, { value: "approved_unpaid", label: "Approved, awaiting payment" }, { value: "changes_requested", label: "Changes requested" }, { value: "rejected", label: "Declined" }]} placeholder="Choose a status" /></div>
        : field("Value", "value", "Optional comparison value")}
      <p className="text-xs leading-5 text-ink-soft">Connect the green Yes and red No handles to separate paths. For a publish email, choose Review status, Equals, Published; connect Yes to Email and No to End.</p>
    </>}
    {node.data.kind === "email_condition" && <>
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Check this email</p><BrandSelect value={String(config.emailNodeId || "")} onChange={(value) => set("emailNodeId", value)} options={emailNodes.map((emailNode) => ({ value: emailNode.id, label: emailNode.data.label }))} placeholder="Select an earlier email" /></div>
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Engagement</p><BrandSelect value={String(config.condition || "opened")} onChange={(value) => set("condition", value)} options={[{ value: "opened", label: "Was opened" }, { value: "not_opened", label: "Was not opened" }, { value: "clicked", label: "Was clicked" }, { value: "not_clicked", label: "Was not clicked" }]} /></div>
      <p className="text-xs leading-5 text-ink-soft">The Yes path continues when the selected email matches. The No path runs otherwise.</p>
    </>}
    {node.data.kind === "wait" && <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Wait</p><BrandSelect value={config.mode === "event" ? "event" : "duration"} onChange={(value) => onChange({ config: value === "event" ? { ...config, mode: "event", eventKey: config.eventKey || (triggerKey.startsWith("directory_tool.") ? "directory_tool.reviewed" : triggers[0]?.value || ""), matchField: config.matchField || (triggerKey.startsWith("directory_tool.") ? "data.tool_id" : "contact_id"), timeoutDays: config.timeoutDays || 30, filterField: config.filterField ?? "", filterValue: config.filterValue ?? "" } : { ...config, mode: "duration" } })} options={[{ value: "duration", label: "For a set time" }, { value: "event", label: "Until an event happens" }]} /></div>}
    {node.data.kind === "wait" && config.mode === "event" && <>
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Continue when this happens</p><BrandSelect value={String(config.eventKey || "")} onChange={(value) => set("eventKey", value)} options={triggers.map((trigger) => ({ value: trigger.value, label: trigger.label }))} searchable searchPlaceholder="Find an event" placeholder="Choose an event" /></div>
      {field("…for the same", "matchField", "data.tool_id")}
      <p className="-mt-2 text-[11px] leading-4 text-ink-soft">The field both events share, so this run only continues for its own record. For tools use <code>data.tool_id</code>; for a person use <code>contact_id</code>.</p>
      {field("Only if this field (optional)", "filterField", "data.status")}
      {String(config.filterField || "") && field("…equals", "filterValue", "published")}
      <label className="block text-xs font-medium text-ink-soft">Give up after (days)<input type="number" min={1} max={365} value={String(config.timeoutDays ?? 30)} onChange={(event) => set("timeoutDays", Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink" /></label>
      <p className="text-xs leading-5 text-ink-soft">The run pauses here until the event happens for the same record, then continues. If it never happens in time, the run ends. Later steps can use that event&apos;s data as <code>{"{{waited.data.…}}"}</code>.</p>
      {String(config.eventKey || "") && <EventDataPanel eventKey={String(config.eventKey)} prefix="waited" title="Data from the awaited event" />}
    </>}
    {node.data.kind === "wait" && config.mode !== "event" && <>
      <label className="block text-xs font-medium text-ink-soft">Wait for<input type="number" min={1} max={525600} value={String(config.duration ?? 1)} onChange={(event) => set("duration", Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink" /></label>
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Unit</p><BrandSelect value={String(config.unit || "days")} onChange={(value) => set("unit", value)} options={[{ value: "minutes", label: "Minutes" }, { value: "hours", label: "Hours" }, { value: "days", label: "Days" }]} /></div>
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Start counting from</p><BrandSelect value={String(config.anchorPath || "")} onChange={(value) => set("anchorPath", value)} options={[{ value: "", label: "When this step is reached" }, { value: "data.last_active_at", label: "Last course activity" }, { value: "occurred_at", label: "Workflow event time" }]} /></div>
      <p className="text-xs leading-5 text-ink-soft">The workflow pauses here and resumes from the next node on the scheduled dispatcher. Last activity can anchor course inactivity reminders to each learner&apos;s progress date.</p>
    </>}
    {node.data.kind === "email" && <>
      {field("To", "to", "{{contact.email}}")}
      <div>
        <p className="mb-1.5 text-xs font-medium text-ink-soft">From address</p>
        <input
          value={String(config.from || fromAddresses[0]?.value || "")}
          onChange={(event) => set("from", event.target.value)}
          list="workflow-from-suggestions"
          placeholder="you@yourdomain.com"
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
        <datalist id="workflow-from-suggestions">
          {fromAddresses.map((address) => <option key={address.value} value={address.value} />)}
        </datalist>
      </div>
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Email content</p><BrandSelect value={String(config.contentMode || "custom")} onChange={(value) => set("contentMode", value)} options={[{ value: "template", label: "Use a saved template" }, { value: "custom", label: "Write a custom email" }]} /></div>
      {config.contentMode === "template" ? <>
        <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Saved email template</p><BrandSelect value={config.templateKind && config.templateKey ? `${config.templateKind}:${config.templateKey}` : ""} onChange={(value) => { const template = emailTemplates.find((item) => item.value === value); if (template) onChange({ config: { ...config, templateKind: template.kind, templateKey: template.key } }); }} options={emailTemplates.map((template) => ({ value: template.value, label: template.label }))} searchable searchPlaceholder="Find an email template" placeholder="Select a template" /></div>
        {emailTemplates.find((template) => template.value === `${config.templateKind}:${config.templateKey}`) && <div className="rounded-xl border border-line bg-paper-soft p-3"><p className="text-xs font-semibold">{emailTemplates.find((template) => template.value === `${config.templateKind}:${config.templateKey}`)?.subject}</p>{emailTemplates.find((template) => template.value === `${config.templateKind}:${config.templateKey}`)?.critical && <p className="mt-1 text-[11px] text-red-700">Critical platform template</p>}<p className="mt-2 max-h-28 overflow-hidden whitespace-pre-wrap text-[11px] leading-5 text-ink-soft">{emailTemplates.find((template) => template.value === `${config.templateKind}:${config.templateKey}`)?.body.replace(/<[^>]*>/g, " ").slice(0, 500)}</p><p className="mt-2 text-[10px] text-ink-soft">Template content stays linked, so future template edits appear here.</p></div>}
      </> : <>
        {field("Subject", "subject", "Welcome")}
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-soft">Email body</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowEmailPreview((current) => !current)} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink">{showEmailPreview ? "Hide preview" : "Preview"}</button>
            <button type="button" onClick={onOpenComposer} className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper">Open composer</button>
          </div>
          {showEmailPreview && <div className="overflow-hidden rounded-lg border border-line bg-paper-soft">
            {config.body ? <iframe title="Workflow email preview" sandbox="" srcDoc={wrapEmailHtml(String(config.body))} className="h-80 w-full border-0 bg-white" /> : <p className="p-4 text-xs text-ink-soft">Open the composer to write this email.</p>}
          </div>}
        </div>
      </>}
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Type</p><BrandSelect value={String(config.messageType || (config.purpose === "marketing" ? "marketing" : "transactional"))} onChange={(value) => set("messageType", value)} options={[{ value: "transactional", label: "Transactional" }, { value: "marketing", label: "Marketing" }]} /></div>
    </>}
    {node.data.kind === "google_review_request" && <>
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Review email</p><BrandSelect value={String(config.templateKey || "google-review-request")} onChange={(value) => set("templateKey", value)} options={[{ value: "google-review-request", label: "Initial request" }, { value: "google-review-reminder", label: "Reminder" }]} /></div>
      <p className="text-xs leading-5 text-ink-soft">Queues the review email with consent checks and duplicate protection.</p>
    </>}
    {node.data.kind === "whatsapp" && <>
      {field("Phone", "phone", "{{contact.phone}}")}
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Type</p><BrandSelect value={String(config.messageType || (whatsappTemplates.find((template) => template.name === config.templateName && template.language === config.languageCode)?.category === "MARKETING" ? "marketing" : "transactional"))} onChange={(value) => set("messageType", value)} options={[{ value: "transactional", label: "Transactional" }, { value: "marketing", label: "Marketing" }]} /></div>
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Approved template</p><BrandSelect value={config.templateName ? `${String(config.templateName)}:${String(config.languageCode || "en")}` : ""} onChange={(value) => { const template = whatsappTemplates.find((item) => `${item.name}:${item.language}` === value); onChange({ config: { ...config, templateName: template?.name || "", languageCode: template?.language || "en", messageType: template?.category === "MARKETING" ? "marketing" : "transactional", variables: template ? Array.from({ length: template.variableCount }, () => "{{contact.name}}") : [] } }); }} options={whatsappTemplates.map((template) => ({ value: `${template.name}:${template.language}`, label: `${template.name} · ${template.language} · ${template.category.toLowerCase()}` }))} searchable searchPlaceholder="Find a WhatsApp template" placeholder="Select an approved template" /></div>
      {whatsappTemplates.find((template) => template.name === config.templateName && template.language === config.languageCode) && <div className="rounded-xl border border-line bg-paper-soft p-3"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Approved message</p><p className="whitespace-pre-wrap text-xs leading-5 text-ink">{whatsappTemplates.find((template) => template.name === config.templateName && template.language === config.languageCode)?.body}</p></div>}
      {Array.isArray(config.variables) && config.variables.length > 0 && <div><p className="text-xs font-medium text-ink-soft">Template variable mapping</p><p className="mt-1 text-[11px] leading-4 text-ink-soft">Map each numbered placeholder from the approved message to a contact or event value.</p><div className="mt-2 space-y-2">{config.variables.map((variable, index) => <label key={index} className="block text-xs font-medium text-ink-soft">Variable {index + 1}<input value={String(variable)} onChange={(event) => { const values = [...config.variables as unknown[]]; values[index] = event.target.value; set("variables", values); }} placeholder="{{contact.name}}" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink" /></label>)}</div></div>}
      <p className="text-xs leading-5 text-ink-soft">Only approved Meta templates can send. WhatsApp opt-outs and marketing consent are checked at send time.</p>
    </>}
    {node.data.kind === "webhook" && <>{field("Destination URL", "url", "https://example.com/hook")}<p className="text-xs leading-5 text-ink-soft">The destination receives a signed JSON request. Production requires HTTPS; private and local addresses are blocked.</p></>}
    {node.data.kind === "course_access" && <>
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Course</p><BrandSelect value={String(config.courseId || "")} onChange={(value) => set("courseId", Number(value) || "")} options={courses.map((course) => ({ value: String(course.id), label: course.title }))} placeholder="Choose a course" searchable /></div>
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Access tier</p><BrandSelect value={String(config.tier || "free")} onChange={(value) => set("tier", value)} options={[{ value: "free", label: "Free access" }, { value: "pro", label: "PRO access" }]} /></div>
      {field("Recipient email", "email", "{{contact.email}}")}
      <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">Privileged action: this grants course access and sends the site&apos;s account access email. Review the trigger and access tier before activating.</p>
    </>}
    {node.data.kind === "contact_unsubscribe" && <p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs leading-5 text-orange-900">Marks the matched CRM contact as unsubscribed, adds the address to email suppression, and syncs its newsletter subscription. It will not affect account login or course access.</p>}
    {node.data.kind === "contact_update" && <>
      <div><p className="mb-1.5 text-xs font-medium text-ink-soft">Contact field</p><BrandSelect value={String(config.field || "name")} onChange={(value) => set("field", value)} options={[{ value: "name", label: "Name" }, { value: "phone", label: "Phone" }]} /></div>
      {field("New value", "value", "{{data.phone}}")}
      <p className="text-xs leading-5 text-ink-soft">Updates the matched CRM contact. Map values from the trigger with merge fields such as {"{{data.phone}}"}.</p>
    </>}
    {node.data.kind === "contact_delete" && <>
      <label className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-900"><input type="checkbox" checked={config.confirm === true} onChange={(event) => set("confirm", event.target.checked)} className="mt-1 accent-red-700" /><span>Confirm this removes the CRM contact record. Email suppression is retained; user accounts and course access are not deleted.</span></label>
      <p className="text-xs leading-5 text-ink-soft">This action only removes contacts already unsubscribed, hard-bounced, or invalid. Spam complaint records are retained. It cannot delete an active, deliverable contact.</p>
    </>}
    {node.data.kind === "stop" && <p className="text-sm text-ink-soft">Ends this workflow path.</p>}
    {["condition", "email", "whatsapp", "webhook", "contact_update"].includes(node.data.kind) && triggerType === "event" && triggerKey && <div className="space-y-3 border-t border-line pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Data you can use</p>
      <EventDataPanel eventKey={triggerKey} prefix="" title="From the trigger" onPick={node.data.kind === "condition" ? (path) => set("field", path) : undefined} />
      {eventWaitKey && <EventDataPanel eventKey={eventWaitKey} prefix="waited" title="From the awaited event (after the wait)" onPick={node.data.kind === "condition" ? (path) => set("field", path) : undefined} />}
    </div>}
  </div>;
}
