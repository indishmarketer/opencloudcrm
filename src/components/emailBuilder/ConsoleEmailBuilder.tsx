"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
import EmailAttributeCatalog from "@/components/emailBuilder/EmailAttributeCatalog";
import {
  EMAIL_BLOCK_DEFS,
  createEmailBlock,
  emailBlockFields,
  emailStyleFields,
  getEmailBlockDef,
  type EmailBlock,
} from "@/lib/emailBlocks";
import { renderEmailBlocksToHtml, renderFooterPreview } from "@/lib/emailBlocksRender";
import { wrapEmailHtml } from "@/lib/emailShell";
import MediaLibraryPicker from "@/components/MediaLibraryPicker";
import { EMAIL_ATTRIBUTES, type MessageVariable } from "@/lib/messageVariables";

type Values = Record<string, unknown>;

/** Decorative only -- lets the preview show something readable instead of
 * literal "{{first_name}}" placeholders. Never saved; the real send still
 * goes through the actual merge-tag system (messageVariables.ts /
 * applyTemplateVars) with the real recipient's data. */
const PREVIEW_SAMPLE_VARS: Record<string, string> = {
  first_name: "Jamie",
  last_name: "Rivera",
  name: "Jamie Rivera",
  phone: "+1 555 0100",
  country: "United States",
  address: "123 Example Street",
  source: "signup",
  course_title: "Sample course",
  course_url: "https://example.com/account/courses/sample-course",
  "data.code": "123456",
  "data.verification_url": "https://example.com/verify?token=sample",
  "data.magic_link_url": "https://example.com/verify?token=sample",
  email: "jamie@example.com",
  business_name: "Your Business",
  site_name: "Your Business",
};

const button =
  "inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink disabled:opacity-50";
const primaryButton =
  "inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50";
const iconButton = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-paper-soft hover:text-ink";

/** Drops Tiptap's "prose" typography sizing/colour (which would override
 * this block's own Text colour/Text size style fields via inherited inline
 * styles) while keeping just enough of its own styling that lists, quotes
 * and links still look like themselves on the canvas. */
const INLINE_TEXT_CONTENT_CLASS =
  "max-w-none min-h-[1.4em] focus:outline-none [&_p]:my-0 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:italic [&_a]:underline";

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

function InlineText({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) ref.current.textContent = value;
  }, [value]);
  return <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-label={label} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} onInput={(event) => onChange(event.currentTarget.textContent || "")} className="min-h-8 cursor-text whitespace-pre-wrap outline-none focus:ring-1 focus:ring-ink/30" />;
}

function blockPadding(props: Values): CSSProperties {
  return {
    padding: `${Number(props.paddingY ?? 12)}px ${Number(props.paddingX ?? 24)}px`,
    backgroundColor: String(props.backgroundColor || "transparent"),
    textAlign: String(props.align || "left") as CSSProperties["textAlign"],
  };
}

function blockTextStyle(props: Values): CSSProperties {
  return {
    color: String(props.textColor || "#1a1a1a"),
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: Number(props.fontSize ?? 16),
    fontWeight: String(props.fontWeight || "normal"),
    lineHeight: 1.6,
  };
}

function CanvasImage({ src, alt, width }: { src: string; alt: string; width: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- email image URLs need their original source and dimensions
    <img src={src} alt={alt} style={{ width: width > 0 ? width : "auto", maxWidth: "100%", height: "auto" }} />
  );
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
  onChangeProps,
  businessName,
  businessAddress,
  socialProps,
}: {
  block: EmailBlock;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onChangeProps: (props: Values) => void;
  businessName: string;
  businessAddress: string;
  socialProps?: Values;
}) {
  const def = getEmailBlockDef(block.type);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const props = block.props;
  const update = (key: string, value: string) => onChangeProps({ ...props, [key]: value });
  const preview = block.type === "footer"
    ? renderFooterPreview(props, businessName, businessAddress, socialProps)
    : renderEmailBlocksToHtml([block], PREVIEW_SAMPLE_VARS);

  async function uploadImage(file: File) {
    setUploading(true);
    setImageError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/console/pages/image-upload", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.url) throw new Error(body.error || "Upload failed.");
      update("src", body.url);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  let content: ReactNode;
  if (block.type === "heading") {
    content = <div style={blockPadding(props)}><div style={blockTextStyle(props)}><InlineText label="Heading text" value={String(props.text || "")} onChange={(value) => update("text", value)} /></div></div>;
  } else if (block.type === "text") {
    content = <div style={blockPadding(props)}><div style={blockTextStyle(props)}>
      <RichTextEditor
        value={String(props.html || "")}
        onChange={(html) => update("html", html)}
        textOnly
        showToolbar={selected}
        wrapperClassName=""
        contentClassName={INLINE_TEXT_CONTENT_CLASS}
      />
    </div></div>;
  } else if (block.type === "columns") {
    content = <div style={blockPadding(props)}><div className="grid grid-cols-2" style={blockTextStyle(props)}>
      <div className="min-w-0 pr-3">
        <RichTextEditor
          value={String(props.leftHtml || "")}
          onChange={(html) => update("leftHtml", html)}
          textOnly
          showToolbar={selected}
          wrapperClassName=""
          contentClassName={INLINE_TEXT_CONTENT_CLASS}
        />
      </div>
      <div className="min-w-0 pl-3">
        <RichTextEditor
          value={String(props.rightHtml || "")}
          onChange={(html) => update("rightHtml", html)}
          textOnly
          showToolbar={selected}
          wrapperClassName=""
          contentClassName={INLINE_TEXT_CONTENT_CLASS}
        />
      </div>
    </div></div>;
  } else if (block.type === "button") {
    content = <div style={blockPadding(props)}><input aria-label="Button label" value={String(props.label || "")} onChange={(event) => update("label", event.target.value)} className="max-w-full text-center outline-none" style={{ backgroundColor: String(props.buttonColor || "#0a0a0a"), color: String(props.buttonTextColor || "#ffffff"), borderRadius: Number(props.borderRadius ?? 6), padding: "12px 28px", fontFamily: "Helvetica, Arial, sans-serif", fontSize: 15, fontWeight: 600, width: `${Math.max(120, String(props.label || "").length * 10 + 56)}px` }} placeholder="Button label" />{selected && <input aria-label="Button link" value={String(props.href || "")} onChange={(event) => update("href", event.target.value)} className="mt-2 block w-full rounded border border-line bg-white px-2 py-1 text-xs text-ink outline-none focus:border-ink" placeholder="https://... or paste a link attribute" />}</div>;
  } else if (block.type === "image") {
    content = <div style={blockPadding(props)}><button type="button" onClick={() => setImagePickerOpen(true)} className="inline-block max-w-full border-0 bg-transparent p-0 text-left" title="Choose an image">{props.src ? <CanvasImage src={String(props.src)} alt={String(props.alt || "")} width={Number(props.width)} /> : <span className="inline-flex min-h-32 min-w-48 items-center justify-center rounded-lg border border-dashed border-line bg-paper-soft px-5 text-sm text-ink-soft">Choose an image</span>}</button>{selected && <div className="mt-2 flex gap-2"><button type="button" onClick={() => setImagePickerOpen(true)} className={button}>Browse library</button><button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={button}>{uploading ? "Uploading…" : "Upload"}</button></div>}{selected && <input aria-label="Image URL" value={String(props.src || "")} onChange={(event) => update("src", event.target.value)} className="mt-2 block w-full rounded border border-line bg-white px-2 py-1 text-xs text-ink outline-none focus:border-ink" placeholder="https://... or browse the library" />}{imageError && <p className="mt-2 text-xs text-red-600">{imageError}</p>}<input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = ""; }} />{imagePickerOpen && <MediaLibraryPicker onSelect={(url) => { update("src", url); setImagePickerOpen(false); }} onClose={() => setImagePickerOpen(false)} />}</div>;
  } else if (preview) {
    content = <div onClickCapture={(event) => { if ((event.target as HTMLElement).closest("a")) event.preventDefault(); }} dangerouslySetInnerHTML={{ __html: preview }} />;
  } else {
    content = <div style={blockPadding(props)} className="text-xs text-ink-soft">{def?.label || block.type}</div>;
  }
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={`group relative bg-white transition-shadow ${selected ? "z-10 ring-2 ring-ink ring-inset" : "hover:ring-1 hover:ring-ink/30 hover:ring-inset"} ${isDragging ? "z-20 opacity-60" : ""}`}
    >
      {content}
      <div className={`absolute -left-2 -top-4 flex items-center gap-1 rounded-lg border border-line bg-white px-1 shadow-sm ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
        <button type="button" {...attributes} {...listeners} onClick={(event) => event.stopPropagation()} aria-label={`Drag ${def?.label || block.type} to reorder`} title="Drag to reorder" className="flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded text-ink-soft hover:bg-paper-soft active:cursor-grabbing"><GripIcon /></button>
        <BlockIcon type={block.type} className="h-4 w-4 text-ink-soft" />
        <span className="text-[10px] font-medium text-ink-soft">{def?.label || block.type}</span>
        <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(); }} aria-label="Delete element" className="flex h-7 w-7 items-center justify-center rounded text-ink-soft hover:bg-red-50 hover:text-red-600"><DeleteIcon /></button>
      </div>
    </div>
  );
}

export default function ConsoleEmailBuilder({
  initialSubject,
  initialBlocks,
  initialBodyHtml,
  onSave,
  onSendTest,
  backHref,
  backLabel,
  businessName,
  businessAddress,
  returnAfterSave = false,
  documentName,
  variables = [],
  onBack,
  onSaved,
}: {
  initialSubject: string;
  initialBlocks: EmailBlock[];
  /** Seeds Classic/HTML mode -- the template's existing body_html, used
   * whichever way it was last written. Ignored once Visual mode's blocks
   * become the save's source of truth again. */
  initialBodyHtml: string;
  onSave: (next: { subject: string; blocks: EmailBlock[] | null; bodyHtml: string }) => Promise<{ ok: boolean; error?: string }>;
  /** Sends the CURRENT unsaved draft (whichever tab was last edited) to a
   * test address, without leaving the composer or saving first. Only
   * offered where the caller actually has somewhere to send from -- a
   * campaign; reusable templates have no send-test concept of their own. */
  onSendTest?: (next: { subject: string; bodyHtml: string }, testTo: string) => Promise<{ ok: boolean; error?: string; sentTo?: string }>;
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
  onBack?: () => void;
  onSaved?: () => void;
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
  const htmlInput = useRef<HTMLTextAreaElement>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  const catalogVariables = [...EMAIL_ATTRIBUTES, ...variables.filter((variable) => !EMAIL_ATTRIBUTES.some((known) => known.token === variable.token))];

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
    if (onSaved) onSaved();
    else if (returnAfterSave) router.push(backHref);
    return true;
  }, [blocks, subject, freeformHtml, onSave, onSaved, router, bodySource, returnAfterSave, backHref]);

  async function sendTest() {
    if (!onSendTest) return;
    setTestStatus("sending");
    setTestMessage("");
    // The draft as it stands right now, not the last-saved copy -- a test
    // send must not force a save first, and must not silently show the
    // sample preview vars (PREVIEW_SAMPLE_VARS) instead of the real
    // {{token}} placeholders the test endpoint fills with the recipient's
    // own data.
    const bodyHtml = bodySource === "visual" ? renderEmailBlocksToHtml(blocks, {}) : freeformHtml;
    const result = await onSendTest({ subject, bodyHtml }, testTo).catch((e): { ok: boolean; error?: string; sentTo?: string } => ({ ok: false, error: e instanceof Error ? e.message : "Could not send the test." }));
    setTestStatus(result.ok ? "sent" : "error");
    setTestMessage(result.ok ? `Sent to ${result.sentTo}` : result.error || "Something went wrong.");
    if (result.ok) setTimeout(() => { setTestStatus("idle"); setTestOpen(false); }, 2000);
  }

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
      } else if (e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA"].includes(e.target.tagName))) {
        return;
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

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white text-ink">
      <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => onBack ? onBack() : router.push(backHref)} aria-label={backLabel} title={backLabel} className={iconButton}>
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
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setDirty(true);
            }}
            className="w-64 truncate rounded border-b border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-line focus:border-ink"
            placeholder="Subject line"
          />
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
          {onSendTest && (
            <div className="relative">
              <button type="button" onClick={() => { setTestOpen((v) => !v); setTestStatus("idle"); setTestMessage(""); }} className={button}>
                Send test
              </button>
              {testOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-line bg-white p-3 shadow-lg">
                  <p className="text-xs font-medium text-ink">Send this draft as a test</p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">Sends exactly what&apos;s on screen now, unsaved changes included.</p>
                  <input
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void sendTest(); }}
                    placeholder="Send test to (default: you)"
                    aria-label="Send test to"
                    className="mt-2 block w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {testMessage && <span className={`text-xs ${testStatus === "error" ? "text-red-600" : "text-ink-soft"}`}>{testMessage}</span>}
                    <button type="button" onClick={() => void sendTest()} disabled={testStatus === "sending"} className={`${primaryButton} ml-auto`}>
                      {testStatus === "sending" ? "Sending…" : "Send"}
                    </button>
                  </div>
                </div>
              )}
            </div>
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
        <div className="flex min-h-0 flex-1">
          <main className="flex min-h-0 flex-1 flex-col bg-paper-soft p-6">
            {/* fillHeight: the toolbar stays fixed at the top of this panel
                and only the text below it scrolls, instead of the whole
                editor (toolbar included) scrolling away inside a taller
                page -- without it, formatting a long email meant scrolling
                back up to reach the toolbar every time. */}
            <RichTextEditor
              value={freeformHtml}
              variables={[]}
              fillHeight
              onChange={(html) => {
                setFreeformHtml(html);
                setBodySource("html");
                setDirty(true);
              }}
            />
          </main>
          <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-line p-4"><EmailAttributeCatalog variables={catalogVariables} /></aside>
        </div>
      ) : composerMode === "html" ? (
        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 flex-1 overflow-y-auto bg-paper-soft p-6">
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
          <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-line p-4"><EmailAttributeCatalog variables={catalogVariables} /></aside>
        </div>
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
              <div onClick={(e) => e.stopPropagation()} className="mx-auto w-full max-w-[600px] bg-white shadow-sm">
                <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  {blocks.map((block) => (
                    <SortableBlockCard
                      key={block.id}
                      block={block}
                      selected={block.id === selectedId}
                      onSelect={() => setSelectedId(block.id)}
                      onDelete={() => removeBlock(block.id)}
                      onChangeProps={(props) => updateProps(block.id, props)}
                      businessName={businessName}
                      businessAddress={businessAddress}
                      socialProps={blocks.find((b) => b.type === "socialIcons")?.props}
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
                      {emailBlockFields(selectedDef).filter((field) => !["text", "html", "label", "src", "leftHtml", "rightHtml"].includes(field.key)).length > 0 && <FieldGroup fields={emailBlockFields(selectedDef).filter((field) => !["text", "html", "label", "src", "leftHtml", "rightHtml"].includes(field.key))} values={selected.props} onChange={(next) => updateProps(selected.id, next)} linkOptions={[]} />}
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
              <EmailAttributeCatalog variables={catalogVariables} />
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
