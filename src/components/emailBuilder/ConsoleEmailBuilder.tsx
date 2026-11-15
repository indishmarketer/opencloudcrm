"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FieldGroup } from "@/components/PageBlockFields";
import BlockIcon from "@/components/pageEditor/blockIcons";
import RichTextEditor from "@/components/RichTextEditor";
import EmailElementsPalette from "@/components/emailBuilder/EmailElementsPalette";
import {
  EMAIL_BLOCK_DEFS,
  createEmailBlock,
  emailBlockFields,
  emailStyleFields,
  getEmailBlockDef,
  type EmailBlock,
} from "@/lib/emailBlocks";
import { renderEmailBlocksToHtml } from "@/lib/emailBlocksRender";
import { wrapEmailHtml } from "@/lib/emailShell";
import BrandSelect from "@/components/BrandSelect";
import type { MessageVariable } from "@/lib/messageVariables";

type Values = Record<string, unknown>;

/** Decorative only -- lets the preview show something readable instead of
 * literal "{{first_name}}" placeholders. Never saved; the real send still
 * goes through the actual merge-tag system (messageVariables.ts /
 * applyTemplateVars) with the real recipient's data. */
const PREVIEW_SAMPLE_VARS: Record<string, string> = {
  first_name: "Jamie",
  name: "Jamie Rivera",
  phone: "+1 555 0100",
  course_title: "Sample course",
  course_url: "https://example.com/account/courses/sample-course",
  email: "jamie@example.com",
  business_name: "Your Business",
  site_name: "Your Business",
};

const button =
  "inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink disabled:opacity-50";
const primaryButton =
  "inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50";
const iconButton = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-paper-soft hover:text-ink";

const BackIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m14.5 5-7 7 7 7M8 12h12" />
  </svg>
);
const UndoIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-2" />
  </svg>
);
const RedoIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h2" />
  </svg>
);
const DesktopIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M9 20h6M12 16v4" />
  </svg>
);
const MobileIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="7" y="2.5" width="10" height="19" rx="1.8" /><path d="M11 18h2" />
  </svg>
);
const DeleteIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </svg>
);
const GripIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
    <circle cx="9" cy="6" r="1.3" /><circle cx="15" cy="6" r="1.3" />
    <circle cx="9" cy="12" r="1.3" /><circle cx="15" cy="12" r="1.3" />
    <circle cx="9" cy="18" r="1.3" /><circle cx="15" cy="18" r="1.3" />
  </svg>
);

/** A one-line description of a block's own content, so the edit canvas
 * (a plain selectable/draggable list, not a true rendered preview -- see
 * the "Preview" toggle for that) still shows something recognisable
 * instead of every card reading identically. */
function blockSummaryText(block: EmailBlock): string {
  switch (block.type) {
    case "heading":
    case "text":
      return String(block.props.text ?? block.props.html ?? "").replace(/<[^>]+>/g, "").trim() || "(empty)";
    case "image":
      return String(block.props.src || "(no image chosen)");
    case "button":
      return `"${block.props.label || "Button"}" → ${block.props.href || "(no link)"}`;
    case "divider":
      return "Horizontal line";
    case "spacer":
      return `${block.props.height || 24}px of blank space`;
    case "columns":
      return "Two columns";
    case "socialIcons":
      return "Social links";
    case "footer":
      return "Footer preview (automatic -- style only)";
    default:
      return "";
  }
}

function CanvasEndDropzone({ empty }: { empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "email-canvas-end" });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border border-dashed transition-colors ${
        isOver ? "border-ink bg-paper-soft text-ink" : "border-line text-ink-soft"
      } ${empty ? "p-12 text-center text-sm" : "flex items-center justify-center py-4 text-xs"}`}
    >
      {empty ? "Empty email. Drag an element here from the left, or click one to add it." : "+ Drop element here"}
    </div>
  );
}

function SortableBlockCard({
  block,
  selected,
  onSelect,
  onDelete,
}: {
  block: EmailBlock;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const def = getEmailBlockDef(block.type);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-paper px-3 py-2.5 transition-colors ${
        selected ? "border-ink shadow-sm" : "border-line hover:border-ink/40"
      } ${isDragging ? "z-10 opacity-60" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
        title="Drag to reorder"
        className="flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-ink-soft hover:bg-paper-soft active:cursor-grabbing"
      >
        <GripIcon />
      </button>
      <BlockIcon type={block.type} className="h-4 w-4 shrink-0 text-ink-soft" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{def?.label || block.type}</p>
        <p className="truncate text-xs text-ink-soft">{blockSummaryText(block)}</p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete element"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-red-50 hover:text-red-600"
      >
        <DeleteIcon />
      </button>
    </div>
  );
}

export default function ConsoleEmailBuilder({
  initialSubject,
  initialBlocks,
  initialBodyHtml,
  onSave,
  backHref,
  backLabel,
  businessName,
  businessAddress,
  returnAfterSave = false,
  documentName,
  variables = [],
}: {
  initialSubject: string;
  initialBlocks: EmailBlock[];
  /** Seeds Classic/HTML mode -- the template's existing body_html, used
   * whichever way it was last written. Ignored once Visual mode's blocks
   * become the save's source of truth again. */
  initialBodyHtml: string;
  onSave: (next: { subject: string; blocks: EmailBlock[] | null; bodyHtml: string }) => Promise<{ ok: boolean; error?: string }>;
  backHref: string;
  backLabel: string;
  /** Live values, so the Footer block's preview (style-only, never part
   * of body_html -- see emailBlocksRender.ts) shows what will actually
   * render instead of a guess. */
  businessName: string;
  businessAddress: string;
  returnAfterSave?: boolean;
  documentName?: string;
  variables?: MessageVariable[];
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(initialSubject);
  const [blocks, setBlocks] = useState<EmailBlock[]>(initialBlocks);
  // The one thing Classic and HTML mode share -- a plain HTML string. Visual
  // mode never reads or writes it; it's only consulted at save time (see
  // save(), below), so switching between modes to look is free, and nothing
  // is lost until you actually save in a given mode.
  const [freeformHtml, setFreeformHtml] = useState(initialBodyHtml);
  const [composerMode, setComposerMode] = useState<"visual" | "classic" | "html">(
    initialBlocks.length > 0 || !initialBodyHtml.trim() ? "visual" : "classic"
  );
  // Existing HTML templates have no block layout. Keep that source intact
  // until the owner explicitly converts it into an editable visual block.
  const [bodySource, setBodySource] = useState<"visual" | "html">(initialBlocks.length > 0 ? "visual" : "html");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [previewFormat, setPreviewFormat] = useState<"visual" | "html">("visual");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);
  const subjectInput = useRef<HTMLInputElement>(null);
  const htmlInput = useRef<HTMLTextAreaElement>(null);

  function insertInSubject(token: string) {
    const tag = `{{${token}}}`;
    const position = subjectInput.current?.selectionStart ?? subject.length;
    setSubject((current) => current.slice(0, position) + tag + current.slice(position));
    setDirty(true);
    requestAnimationFrame(() => { subjectInput.current?.focus(); subjectInput.current?.setSelectionRange(position + tag.length, position + tag.length); });
  }

  function insertInHtml(token: string) {
    const tag = `{{${token}}}`;
    const position = htmlInput.current?.selectionStart ?? freeformHtml.length;
    setFreeformHtml((current) => current.slice(0, position) + tag + current.slice(position));
    setBodySource("html");
    setDirty(true);
    requestAnimationFrame(() => { htmlInput.current?.focus(); htmlInput.current?.setSelectionRange(position + tag.length, position + tag.length); });
  }

  const selected = blocks.find((b) => b.id === selectedId) || null;
  const selectedDef = selected ? getEmailBlockDef(selected.type) : null;

  const [history, setHistory] = useState<{ past: EmailBlock[][]; future: EmailBlock[][] }>({ past: [], future: [] });
  const change = useCallback(
    (next: EmailBlock[]) => {
      setHistory((curr) => ({ past: [...curr.past.slice(-20), blocks], future: [] }));
      setBlocks(next);
      setBodySource("visual");
      setDirty(true);
    },
    [blocks],
  );
  const undo = useCallback(() => {
    if (history.past.length === 0) return;
    const prev = history.past[history.past.length - 1];
    setHistory((curr) => ({ past: curr.past.slice(0, -1), future: [blocks, ...curr.future] }));
    setBlocks(prev);
    setBodySource("visual");
    setDirty(true);
  }, [blocks, history.past]);
  const redo = useCallback(() => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    setHistory((curr) => ({ past: [...curr.past, blocks], future: curr.future.slice(1) }));
    setBlocks(next);
    setBodySource("visual");
    setDirty(true);
  }, [blocks, history.future]);

  function addBlock(type: string) {
    const block = createEmailBlock(type);
    change([...blocks, block]);
    setSelectedId(block.id);
  }
  function updateProps(id: string, next: Values) {
    change(blocks.map((b) => (b.id === id ? { ...b, props: next } : b)));
  }
  function removeBlock(id: string) {
    change(blocks.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  const save = useCallback(async () => {
    setBusy(true);
    setError("");
    // Save the last content source actually edited. Looking at another tab
    // must not replace a template's body or change its stored format.
    const payload = bodySource === "visual"
      ? { subject, blocks, bodyHtml: renderEmailBlocksToHtml(blocks, {}) }
      : { subject, blocks: null, bodyHtml: freeformHtml };
    const result = await onSave(payload).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "Could not save." }));
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Could not save this email.");
      return false;
    }
    if (bodySource === "visual") {
      setFreeformHtml(payload.bodyHtml);
    } else {
      setBlocks([]);
      setSelectedId(null);
      setHistory({ past: [], future: [] });
    }
    setDirty(false);
    setMessage("Saved.");
    setTimeout(() => setMessage(""), 2500);
    router.refresh();
    if (returnAfterSave) router.push(backHref);
    return true;
  }, [blocks, subject, freeformHtml, onSave, router, bodySource, returnAfterSave, backHref]);

  const saveRef = useRef(save);
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  useEffect(() => {
    saveRef.current = save;
    undoRef.current = undo;
    redoRef.current = redo;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void saveRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
      } else if ((e.ctrlKey || e.metaKey) && ((e.key === "z" && e.shiftKey) || e.key === "y")) {
        e.preventDefault();
        redoRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { kind?: string; blockType?: string } | undefined;
    if (data?.kind === "email-palette" && data.blockType) {
      setActiveDragLabel(getEmailBlockDef(data.blockType)?.label || data.blockType);
      return;
    }
    const dragged = blocks.find((b) => b.id === event.active.id);
    setActiveDragLabel(dragged ? getEmailBlockDef(dragged.type)?.label || dragged.type : null);
  }
  function handleDragEnd(event: DragEndEvent) {
    setActiveDragLabel(null);
    const { active, over } = event;
    if (!over) return;
    const data = active.data.current as { kind?: string; blockType?: string } | undefined;
    if (data?.kind === "email-palette" && data.blockType) {
      const block = createEmailBlock(data.blockType);
      const index = over.id === "email-canvas-end" ? blocks.length : Math.max(0, blocks.findIndex((b) => b.id === over.id));
      const next = [...blocks];
      next.splice(index, 0, block);
      change(next);
      setSelectedId(block.id);
      return;
    }
    if (active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = over.id === "email-canvas-end" ? blocks.length - 1 : blocks.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    change(arrayMove(blocks, oldIndex, newIndex));
  }

  const previewVars = PREVIEW_SAMPLE_VARS;
  const bodyHtml = bodySource === "visual" ? renderEmailBlocksToHtml(blocks, previewVars) : freeformHtml;
  const fullHtml = wrapEmailHtml(bodyHtml);
  const footerBlock = blocks.find((b) => b.type === "footer");
  void businessName; void businessAddress; // reserved for the footer preview, wired in Phase 4

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white text-ink">
      <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => router.push(backHref)} aria-label={backLabel} title={backLabel} className={iconButton}>
            <BackIcon />
          </button>
          <div className="flex items-center gap-0.5 rounded-lg bg-paper-soft p-0.5">
            <button type="button" onClick={undo} disabled={history.past.length === 0} aria-label="Undo" title="Undo (Ctrl+Z)" className={`${iconButton} h-8 w-8 disabled:opacity-40`}>
              <UndoIcon />
            </button>
            <button type="button" onClick={redo} disabled={history.future.length === 0} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className={`${iconButton} h-8 w-8 disabled:opacity-40`}>
              <RedoIcon />
            </button>
          </div>
          <span className={`h-2 w-2 shrink-0 rounded-full ${dirty ? "bg-amber-500" : "bg-green-500"}`} aria-hidden="true" />
          {documentName && <span className="max-w-32 truncate text-xs font-medium text-ink-soft" title={documentName}>{documentName}</span>}
          <input
            ref={subjectInput}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setDirty(true);
            }}
            className="w-64 truncate rounded border-b border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-line focus:border-ink"
            placeholder="Subject line"
          />
          {variables.length > 0 && <div className="w-36 shrink-0"><BrandSelect value="" placeholder="＋ Attributes" compact onChange={insertInSubject} options={variables.map((item) => ({ value: item.token, label: item.label }))} searchable /></div>}
          {error && <span className="truncate text-xs text-red-600">{error}</span>}
          {message && <span className="text-xs text-ink-soft">{message}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-paper-soft p-0.5">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === "edit" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === "preview" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
            >
              Preview
            </button>
          </div>
          {mode === "preview" && (
            <div className="flex items-center gap-0.5 rounded-lg bg-paper-soft p-0.5">
              <button
                type="button"
                onClick={() => setDevice("desktop")}
                aria-label="Desktop"
                title="Desktop"
                className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${device === "desktop" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
              >
                <DesktopIcon />
              </button>
              <button
                type="button"
                onClick={() => setDevice("mobile")}
                aria-label="Mobile"
                title="Mobile"
                className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${device === "mobile" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
              >
                <MobileIcon />
              </button>
            </div>
          )}
          {mode === "preview" && (
            <button type="button" onClick={() => setPreviewFormat((f) => (f === "visual" ? "html" : "visual"))} className={button}>
              {previewFormat === "visual" ? "View HTML" : "View visual"}
            </button>
          )}
          <button type="button" onClick={() => void save()} disabled={busy || !dirty} className={primaryButton}>
            {busy ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </header>

      {mode === "edit" && (
        <div className="z-20 flex h-11 shrink-0 items-center gap-1 border-b border-line bg-paper-soft px-4">
          {([
            { id: "visual" as const, label: "Visual" },
            { id: "classic" as const, label: "Classic" },
            { id: "html" as const, label: "HTML" },
          ]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === composerMode) return;
                if (tab.id !== "visual" && composerMode === "visual" && bodySource === "visual") {
                  // A block layout has its own HTML representation. An old
                  // HTML-only template must retain its original source.
                  setFreeformHtml(renderEmailBlocksToHtml(blocks, {}));
                }
                setComposerMode(tab.id);
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                composerMode === tab.id ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
          {composerMode !== "visual" && bodySource === "visual" && blocks.length > 0 && (
            <span className="ml-2 text-xs text-ink-soft">
              Editing here replaces your visual blocks with HTML when saved.
            </span>
          )}
        </div>
      )}

      {mode === "preview" ? (
        <main className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto bg-paper-soft p-8">
          {previewFormat === "visual" ? (
            <div
              className="overflow-hidden rounded-xl border border-line bg-white shadow-sm transition-[width]"
              style={{ width: device === "mobile" ? 375 : 600 }}
            >
              <iframe title="Email preview" srcDoc={fullHtml} className="h-[80vh] w-full border-0" />
            </div>
          ) : (
            <pre className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-xl border border-line bg-white p-4 text-xs text-ink">
              <code>{fullHtml}</code>
            </pre>
          )}
        </main>
      ) : composerMode === "classic" ? (
        <main className="min-h-0 flex-1 overflow-y-auto bg-paper-soft p-6">
          <div className="w-full">
            <RichTextEditor
              value={freeformHtml}
              variables={variables}
              onChange={(html) => {
                setFreeformHtml(html);
                setBodySource("html");
                setDirty(true);
              }}
            />
          </div>
        </main>
      ) : composerMode === "html" ? (
        <main className="min-h-0 flex-1 overflow-y-auto bg-paper-soft p-6">
          {variables.length > 0 && <div className="mb-3 w-44"><BrandSelect value="" placeholder="＋ Attributes" compact onChange={insertInHtml} options={variables.map((item) => ({ value: item.token, label: item.label }))} searchable /></div>}
          <textarea
            ref={htmlInput}
            value={freeformHtml}
            onChange={(e) => {
              setFreeformHtml(e.target.value);
              setBodySource("html");
              setDirty(true);
            }}
            spellCheck={false}
            className="h-full min-h-[60vh] w-full rounded-xl border border-line bg-white p-4 font-mono text-xs text-ink outline-none focus:border-ink"
            placeholder="<p>Write the full email HTML here...</p>"
          />
        </main>
      ) : bodySource === "html" && freeformHtml.trim() ? (
        <main className="min-h-0 flex-1 overflow-y-auto bg-paper-soft p-6">
          <div className="mx-auto max-w-[640px] rounded-xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-ink">Existing HTML content</h2>
            <p className="mt-1 text-xs leading-5 text-ink-soft">This email was written in Classic or HTML. Its content is preserved when you switch modes. Edit it there, or convert it into one visual text block to start a block layout. Conversion may change some formatting when you save.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setComposerMode("classic")} className={button}>Edit in Classic</button>
              <button type="button" onClick={() => { const textBlock = createEmailBlock("text"); const block = { ...textBlock, props: { ...textBlock.props, html: freeformHtml } }; change([block]); setSelectedId(block.id); }} className={primaryButton}>Convert to visual block</button>
            </div>
            <iframe title="Existing email content" srcDoc={wrapEmailHtml(freeformHtml)} className="mt-5 h-[520px] w-full rounded-lg border border-line bg-white" />
          </div>
        </main>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDragLabel(null)}>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside className="w-[220px] shrink-0 overflow-y-auto border-r border-line p-3">
              <p className="mb-2 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">Elements</p>
              <EmailElementsPalette defs={EMAIL_BLOCK_DEFS} onPick={addBlock} />
            </aside>

            <main onClick={() => setSelectedId(null)} className="relative min-w-0 flex-1 overflow-y-auto bg-paper-soft p-6">
              <div onClick={(e) => e.stopPropagation()} className="w-full space-y-2">
                <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  {blocks.map((block) => (
                    <SortableBlockCard
                      key={block.id}
                      block={block}
                      selected={block.id === selectedId}
                      onSelect={() => setSelectedId(block.id)}
                      onDelete={() => removeBlock(block.id)}
                    />
                  ))}
                </SortableContext>
                <CanvasEndDropzone empty={blocks.length === 0} />
              </div>
            </main>

            <aside className="w-[340px] shrink-0 space-y-5 overflow-y-auto border-l border-line p-4">
              {selected && selectedDef ? (
                <>
                  <div>
                    <h2 className="text-sm font-semibold text-ink">{selectedDef.label}</h2>
                    <p className="mt-0.5 text-xs text-ink-soft">{selectedDef.description}</p>
                  </div>
                  {emailBlockFields(selectedDef).length > 0 && (
                    <>
                      <FieldGroup fields={emailBlockFields(selectedDef)} values={selected.props} onChange={(next) => updateProps(selected.id, next)} linkOptions={[]} />
                      {variables.length > 0 && emailBlockFields(selectedDef).filter((field) => ["text", "textarea", "link"].includes(field.kind)).map((field) => {
                        const choices = field.kind === "link" ? variables.filter((item) => /(?:_url|_link)$/.test(item.token)) : variables;
                        return choices.length > 0 ? <div key={`attribute-${field.key}`}>
                          <p className="mb-1 text-xs text-ink-soft">Insert attribute in {field.label}</p>
                          <BrandSelect value="" placeholder="＋ Attributes" compact searchable options={choices.map((item) => ({ value: item.token, label: item.label }))} onChange={(token) => {
                            const tag = `{{${token}}}`;
                            const existing = String(selected.props[field.key] || "");
                            updateProps(selected.id, { ...selected.props, [field.key]: field.kind === "link" ? tag : `${existing}${existing ? " " : ""}${tag}` });
                          }} />
                        </div> : null;
                      })}
                    </>
                  )}
                  <div className="space-y-4 border-t border-line pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">Style</h3>
                    <FieldGroup fields={emailStyleFields(selectedDef)} values={selected.props} onChange={(next) => updateProps(selected.id, next)} linkOptions={[]} />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h2 className="text-sm font-semibold text-ink">This email</h2>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      Select an element on the left to edit it. Every email already gets your business name/address and an
                      unsubscribe link automatically -- add a Footer element to preview and restyle it.
                    </p>
                  </div>
                  {!footerBlock && (
                    <button type="button" onClick={() => addBlock("footer")} className={`${button} w-full justify-center`}>
                      + Add footer preview
                    </button>
                  )}
                </>
              )}
            </aside>
          </div>

          <DragOverlay>
            {activeDragLabel && (
              <div className="rounded-xl border border-ink bg-paper px-4 py-2 text-sm font-medium text-ink shadow-2xl">{activeDragLabel}</div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
