"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import ConsoleModal from "@/components/ConsoleModal";
import { useConfirm } from "@/components/ConfirmDialog";
import { FieldGroup, MergeTagHint } from "@/components/PageBlockFields";
import BlockTypePicker from "@/components/pageEditor/BlockTypePicker";
import ElementsPalette from "@/components/pageEditor/ElementsPalette";
import { AddElementButton, NestedElementFrame, TopBlockFrame } from "@/components/pageEditor/LiveBlockFrame";
import MobileCanvasPortal from "@/components/pageEditor/MobileCanvasPortal";
import HtmlTreeEditor from "@/components/pageEditor/HtmlTreeEditor";
import type { NodePath } from "@/lib/htmlTree";
import {
  BLOCK_DEFS,
  blockSummary,
  createBlock,
  getBlockDef,
  newBlockId,
  styleFields,
  type PageBlock,
} from "@/lib/pageBlocks";
import type { SitePage } from "@/lib/sitePagesShape";
import type { PageEditorLiveData } from "@/lib/pageEditorLiveData";

const button =
  "rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton =
  "rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-60";
const iconButton = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-paper-soft hover:text-ink";
const inputClass =
  "w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition focus:border-ink";

type EditorPage = SitePage & { builtIn: boolean; hasUnpublishedChanges: boolean };
type Selection = { blockId: string; elementId?: string } | null;
type Device = "desktop" | "mobile";

const TOP_LEVEL_DEFS = BLOCK_DEFS.filter((d) => !d.deprecated);

function rowColumns(row: PageBlock): PageBlock[][] {
  return Array.isArray(row.props.items) ? (row.props.items as PageBlock[][]) : [];
}

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
const ElementsIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" />
  </svg>
);
const CloseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6l12 12M18 6L6 18" />
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
const EyeIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const GearIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="m19.4 15 .1.1 1.4 1.1-1.5 2.6-1.7-.7a8.2 8.2 0 0 1-1.7 1l-.3 1.8h-3l-.3-1.8a8.2 8.2 0 0 1-1.7-1l-1.7.7-1.5-2.6 1.4-1.1a7.6 7.6 0 0 1 0-2l-1.4-1.1 1.5-2.6 1.7.7a8.2 8.2 0 0 1 1.7-1l.3-1.8h3l.3 1.8a8.2 8.2 0 0 1 1.7 1l1.7-.7 1.5 2.6-1.4 1.1a7.6 7.6 0 0 1 0 2Z" />
  </svg>
);

function CanvasEndDropzone({ empty }: { empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-end" });
  return (
    <div
      ref={setNodeRef}
      className={`transition-colors ${isOver ? "bg-paper-soft" : ""} ${empty ? "p-16 text-center text-sm text-ink-soft" : "h-10"}`}
    >
      {empty ? "Drag a section here, or click one on the left to add it." : null}
    </div>
  );
}

function SettingsPanel({
  settingsKey,
  title,
  description,
  contentFields,
  styleFieldsList,
  props,
  onChangeProps,
  linkOptions,
  onDuplicate,
  onDelete,
  internal,
  htmlTree,
}: {
  settingsKey: string;
  title: string;
  description: string;
  contentFields: ReturnType<typeof styleFields>;
  styleFieldsList: ReturnType<typeof styleFields>;
  props: Record<string, unknown>;
  onChangeProps: (next: Record<string, unknown>) => void;
  linkOptions: string[];
  onDuplicate?: () => void;
  onDelete: () => void;
  internal?: boolean;
  /** Present only for a "custom" section, which is the one block type
   * whose content is a document rather than a handful of fields -- so it
   * gets a third tab that edits that document as elements instead of as
   * text. Everything else keeps the plain Content/Style pair. */
  htmlTree?: {
    html: string;
    onChange: (html: string) => void;
    selected: NodePath | null;
    onSelect: (path: NodePath | null) => void;
  };
}) {
  const [tab, setTab] = useState<"elements" | "content" | "style">(htmlTree ? "elements" : "content");
  const activeTab = tab === "elements" && !htmlTree ? "content" : tab;
  return (
    <div key={settingsKey} className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-ink-soft">{description}</p>
        </div>
        {!internal && (
          <div className="flex gap-1.5">
            {onDuplicate && (
              <button type="button" onClick={onDuplicate} className={`${button} px-3 py-1.5 text-xs`}>
                Duplicate
              </button>
            )}
            <button type="button" onClick={onDelete} className={`${button} px-3 py-1.5 text-xs text-red-600 hover:border-red-600`}>
              Delete
            </button>
          </div>
        )}
      </div>

      {styleFieldsList.length > 0 && (
        <div className="flex gap-1 rounded-full bg-paper-soft p-1 text-sm font-medium">
          {(htmlTree ? (["elements", "content", "style"] as const) : (["content", "style"] as const)).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full px-3 py-1.5 transition-colors ${activeTab === t ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
            >
              {t === "elements" ? "Elements" : t === "content" ? "Code" : "Style"}
            </button>
          ))}
        </div>
      )}

      {activeTab === "elements" && htmlTree ? (
        <HtmlTreeEditor html={htmlTree.html} onChange={htmlTree.onChange} selected={htmlTree.selected} onSelect={htmlTree.onSelect} />
      ) : activeTab === "content" ? (
        contentFields.length === 0 ? (
          <p className="text-sm text-ink-soft">This section has nothing to set up. Move it, or delete it.</p>
        ) : (
          <div className="space-y-4">
            <FieldGroup fields={contentFields} values={props} onChange={onChangeProps} linkOptions={linkOptions} />
          </div>
        )
      ) : (
        <div className="space-y-4">
          <FieldGroup fields={styleFieldsList} values={props} onChange={onChangeProps} linkOptions={linkOptions} />
        </div>
      )}
    </div>
  );
}

export default function ConsolePageEditor({
  initialPage,
  linkOptions,
  backHref,
  backLabel,
  publicUrl,
  liveData,
}: {
  initialPage: EditorPage;
  linkOptions: string[];
  backHref: string;
  backLabel: string;
  /** Where the published page lives, for "View live". */
  publicUrl: string | null;
  liveData: PageEditorLiveData;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [page, setPage] = useState(initialPage);
  const [blocks, setBlocks] = useState<PageBlock[]>(initialPage.blocks);
  const [meta, setMeta] = useState({
    title: initialPage.title,
    path: initialPage.path || "",
    metaTitle: initialPage.metaTitle,
    metaDescription: initialPage.metaDescription,
    ogImage: initialPage.ogImage,
    noindex: initialPage.noindex,
  });
  const [selection, setSelection] = useState<Selection>(null);
  // The element selected *inside* a custom section, as a path into its
  // HTML (see src/lib/htmlTree.ts). Separate from `selection`, which
  // addresses blocks, and cleared whenever the selected block changes --
  // a path only means anything against one particular section's HTML.
  const [nodePath, setNodePath] = useState<NodePath | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [picker, setPicker] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Undo/redo for the section list. Each edit stores the whole `blocks`
  // array it replaces; undo/redo swap back and forth between snapshots.
  // Held in state (not refs) so the section list stays a single source of
  // truth the React rules are happy with.
  const [history, setHistory] = useState<{ past: PageBlock[][]; future: PageBlock[][] }>({ past: [], future: [] });
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const isPage = page.kind === "page";
  const isHome = page.path === "/";
  const canGoOffline = isPage && !isHome && !page.builtIn;
  const hasBuiltInBlock = blocks.some((b) => b.type === "builtIn");

  const update = useCallback(
    (next: PageBlock[]) => {
      setHistory((h) => ({ past: [...h.past, blocks].slice(-100), future: [] }));
      setBlocks(next);
      setDirty(true);
      setMessage("");
    },
    [blocks]
  );

  const undo = useCallback(() => {
    if (history.past.length === 0) return;
    const prev = history.past[history.past.length - 1];
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [...h.future, blocks] }));
    setSelection(null);
    setNodePath(null);
    setBlocks(prev);
    setDirty(true);
    setMessage("");
  }, [history, blocks]);

  const redo = useCallback(() => {
    if (history.future.length === 0) return;
    const next = history.future[history.future.length - 1];
    setHistory((h) => ({ past: [...h.past, blocks], future: h.future.slice(0, -1) }));
    setSelection(null);
    setNodePath(null);
    setBlocks(next);
    setDirty(true);
    setMessage("");
  }, [history, blocks]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useCallback(
    async (opts: { publish?: boolean } = {}): Promise<boolean> => {
      setBusy(opts.publish ? "publish" : "save");
      setError("");
      setMessage("");
      try {
        const res = await fetch(`/api/v1/pages/${page.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...meta,
            path: isPage && !isHome && !page.builtIn ? meta.path : undefined,
            blocks,
            publish: opts.publish || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't save.");
        setPage((p) => ({ ...p, ...data.page }));
        setBlocks(data.page.blocks);
        setMeta((m) => ({ ...m, path: data.page.path || "" }));
        setDirty(false);
        setMessage(opts.publish ? "Published. It's live now." : "Saved as a draft. Publish when you're ready.");
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save.");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [blocks, meta, page.id, page.builtIn, isPage, isHome]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (key === "z" || key === "y") {
        // While typing inside a field, Ctrl+Z/Y belongs to that field's own
        // undo, not the page-level section history.
        const target = e.target as HTMLElement | null;
        const inField = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
        if (inField) return;
        e.preventDefault();
        if (key === "y" || (key === "z" && e.shiftKey)) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, undo, redo]);

  function addBlock(type: string) {
    const block = createBlock(type);
    const index = selection && !selection.elementId ? blocks.findIndex((b) => b.id === selection.blockId) + 1 : blocks.length;
    update([...blocks.slice(0, index), block, ...blocks.slice(index)]);
    selectBlock({ blockId: block.id });
    setPicker(false);
  }

  async function removeBlock(block: PageBlock) {
    const label = getBlockDef(block.type)?.label || "section";
    const ok = await confirm({
      message:
        block.type === "builtIn"
          ? "Remove this page's own content? Visitors will only see the sections you add. You can add it back from \"Add section\"."
          : `Delete this ${label.toLowerCase()} section?`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const index = blocks.findIndex((b) => b.id === block.id);
    const next = blocks.filter((b) => b.id !== block.id);
    update(next);
    selectBlock(next[Math.max(0, index - 1)] ? { blockId: next[Math.max(0, index - 1)].id } : null);
  }

  function duplicateBlock(block: PageBlock) {
    const copy = { ...structuredClone(block), id: newBlockId() };
    const index = blocks.findIndex((b) => b.id === block.id) + 1;
    update([...blocks.slice(0, index), copy, ...blocks.slice(index)]);
    selectBlock({ blockId: copy.id });
  }

  /** The move-up/down fallback for the Mobile canvas, where @dnd-kit's
   * drag can't track pointer movement happening inside the iframe (see
   * MobileCanvasPortal). */
  function moveBlockBy(id: string, delta: number) {
    const index = blocks.findIndex((b) => b.id === id);
    if (index < 0) return;
    const next = index + delta;
    if (next < 0 || next >= blocks.length) return;
    update(arrayMove(blocks, index, next));
  }

  function updateRowBlock(rowId: string, updater: (row: PageBlock) => PageBlock) {
    update(blocks.map((b) => (b.id === rowId ? updater(b) : b)));
  }

  function addElementToRow(rowId: string, columnIndex: number, type: string) {
    const newBlock = createBlock(type);
    updateRowBlock(rowId, (row) => {
      const cols = rowColumns(row).map((col, i) => (i === columnIndex ? [...col, newBlock] : col));
      return { ...row, props: { ...row.props, items: cols } };
    });
    selectBlock({ blockId: rowId, elementId: newBlock.id });
  }

  function moveElementInRow(rowId: string, columnIndex: number, from: number, to: number) {
    updateRowBlock(rowId, (row) => {
      const cols = rowColumns(row);
      const column = cols[columnIndex];
      if (!column || to < 0 || to >= column.length) return row;
      const nextColumn = [...column];
      const [item] = nextColumn.splice(from, 1);
      nextColumn.splice(to, 0, item);
      return { ...row, props: { ...row.props, items: cols.map((c, i) => (i === columnIndex ? nextColumn : c)) } };
    });
  }

  async function removeElementFromRow(rowId: string, elementId: string) {
    const row = blocks.find((b) => b.id === rowId);
    const element = row ? rowColumns(row).flat().find((b) => b.id === elementId) : null;
    const label = element ? getBlockDef(element.type)?.label || "element" : "element";
    const ok = await confirm({ message: `Delete this ${label.toLowerCase()}?`, confirmLabel: "Delete" });
    if (!ok) return;
    updateRowBlock(rowId, (r) => ({ ...r, props: { ...r.props, items: rowColumns(r).map((col) => col.filter((b) => b.id !== elementId)) } }));
    setSelection((s) => (s && s.blockId === rowId && s.elementId === elementId ? { blockId: rowId } : s));
  }

  function updateElementProps(rowId: string, elementId: string, nextProps: Record<string, unknown>) {
    updateRowBlock(rowId, (row) => ({
      ...row,
      props: { ...row.props, items: rowColumns(row).map((col) => col.map((b) => (b.id === elementId ? { ...b, props: nextProps } : b))) },
    }));
  }

  function renderColumnFor(rowId: string) {
    // eslint-disable-next-line react/display-name -- a render-prop passed to RowBlock, not a component
    return (column: PageBlock[], columnIndex: number) => (
      <>
        {column.map((el, i) => (
          <NestedElementFrame
            key={el.id}
            block={el}
            selected={selection?.blockId === rowId && selection.elementId === el.id}
            onSelect={() => selectBlock({ blockId: rowId, elementId: el.id })}
            onMoveUp={() => moveElementInRow(rowId, columnIndex, i, i - 1)}
            onMoveDown={() => moveElementInRow(rowId, columnIndex, i, i + 1)}
            onRemove={() => void removeElementFromRow(rowId, el.id)}
            canMoveUp={i > 0}
            canMoveDown={i < column.length - 1}
          />
        ))}
        <AddElementButton onAdd={(type) => addElementToRow(rowId, columnIndex, type)} />
      </>
    );
  }

  /** Preview always reads the saved draft, so an in-progress edit is
   * persisted first -- otherwise Preview/Mobile would show stale content. */
  async function ensureSaved(): Promise<boolean> {
    return dirty ? save() : true;
  }

  async function openPreview() {
    if (!(await ensureSaved())) return;
    window.open(`/preview/page/${page.id}`, "_blank", "noopener,noreferrer");
  }

  async function goOffline() {
    const ok = await confirm({ message: "Take this page offline? Visitors will get a \"page not found\" until you publish it again.", confirmLabel: "Take offline" });
    if (!ok) return;
    setBusy("offline");
    const res = await fetch(`/api/v1/pages/${page.id}/unpublish`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error || "Couldn't take the page offline.");
    setPage((p) => ({ ...p, ...data.page }));
    setMessage("The page is offline.");
  }

  async function removePage() {
    const ok = await confirm({
      message: page.builtIn
        ? "Reset this page to its default sections? Your changes to it will be lost."
        : isPage
          ? `Delete ${page.path}? This can't be undone.`
          : "Remove all extra sections from this page?",
      confirmLabel: page.builtIn ? "Reset" : "Delete",
    });
    if (!ok) return;
    setBusy("delete");
    const res = await fetch(`/api/v1/pages/${page.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error || "Couldn't delete the page.");
    setDirty(false);
    router.push(backHref);
    router.refresh();
  }

  const status = useMemo(() => {
    if (page.status === "draft") return { label: page.published ? "Offline" : "Draft", dot: "bg-ink-soft" };
    if (dirty || page.hasUnpublishedChanges) return { label: "Unpublished changes", dot: "bg-amber-500" };
    return { label: "Live", dot: "bg-green-500" };
  }, [page, dirty]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { kind?: string; blockType?: string } | undefined;
    if (data?.kind === "palette" && data.blockType) {
      setActiveDragLabel(getBlockDef(data.blockType)?.label || data.blockType);
      return;
    }
    const dragged = blocks.find((b) => b.id === event.active.id);
    setActiveDragLabel(dragged ? getBlockDef(dragged.type)?.label || dragged.type : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragLabel(null);
    const { active, over } = event;
    if (!over) return;
    const data = active.data.current as { kind?: string; blockType?: string } | undefined;

    if (data?.kind === "palette" && data.blockType) {
      const index = over.id === "canvas-end" ? blocks.length : Math.max(0, blocks.findIndex((b) => b.id === over.id));
      const block = createBlock(data.blockType);
      update([...blocks.slice(0, index), block, ...blocks.slice(index)]);
      selectBlock({ blockId: block.id });
      return;
    }

    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    if (oldIndex < 0) return; // not a top-level section drag
    const newIndex = over.id === "canvas-end" ? blocks.length - 1 : blocks.findIndex((b) => b.id === over.id);
    if (newIndex < 0 || oldIndex === newIndex) return;
    update(arrayMove(blocks, oldIndex, newIndex));
  }

  const selectedTopBlock = selection ? blocks.find((b) => b.id === selection.blockId) || null : null;
  const selectBlock = (next: Selection) => {
    setSelection((current) => {
      if (current?.blockId !== next?.blockId || current?.elementId !== next?.elementId) setNodePath(null);
      return next;
    });
  };
  const selectedElement = selection?.elementId && selectedTopBlock ? rowColumns(selectedTopBlock).flat().find((b) => b.id === selection.elementId) || null : null;

  const settingsTarget = selectedElement
    ? {
        key: selectedElement.id,
        def: getBlockDef(selectedElement.type),
        props: selectedElement.props,
        onChangeProps: (next: Record<string, unknown>) => updateElementProps(selection!.blockId, selection!.elementId!, next),
        onDelete: () => void removeElementFromRow(selection!.blockId, selection!.elementId!),
        canDuplicate: false,
      }
    : selectedTopBlock
      ? {
          key: selectedTopBlock.id,
          def: getBlockDef(selectedTopBlock.type),
          props: selectedTopBlock.props,
          onChangeProps: (next: Record<string, unknown>) => update(blocks.map((b) => (b.id === selectedTopBlock.id ? { ...b, props: next } : b))),
          onDelete: () => void removeBlock(selectedTopBlock),
          canDuplicate: !getBlockDef(selectedTopBlock.type)?.internal,
        }
      : null;

  const nodeEditingFor = (blockId: string) =>
    htmlTree && selectedTopBlock?.id === blockId ? { selectedPath: nodePath, onSelectPath: setNodePath } : undefined;

  /** Elements mode is wired up only for the selected custom section:
   * it writes back into the same `html` prop the Code tab edits, so
   * there is one stored value and the two views cannot drift. */
  const htmlTree =
    selectedTopBlock && selectedTopBlock.type === "custom" && !selection?.elementId
      ? {
          html: String(selectedTopBlock.props.html || ""),
          onChange: (html: string) =>
            update(blocks.map((b) => (b.id === selectedTopBlock.id ? { ...b, props: { ...b.props, html } } : b))),
          selected: nodePath,
          onSelect: setNodePath,
        }
      : undefined;

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white text-ink">
      {dialog}
      {confirmLeave && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/40 px-6">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-paper p-6 shadow-xl">
            <p className="text-sm font-semibold">Leave without saving?</p>
            <p className="mt-1 text-sm text-ink-soft">You have unsaved changes. Save them, or leave and lose them.</p>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 sm:flex-nowrap">
              <button type="button" onClick={() => setConfirmLeave(false)} className="whitespace-nowrap rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-paper-soft">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirty(false);
                  router.push(backHref);
                }}
                className="whitespace-nowrap rounded-full border border-red-200 bg-red-50/60 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-600 hover:bg-red-50 hover:text-red-700"
              >
                Leave without saving
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  if (await save()) router.push(backHref);
                }}
                className="whitespace-nowrap rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-60"
              >
                {busy === "save" ? "Saving…" : "Save & leave"}
              </button>
            </div>
          </div>
        </div>
      )}
      {picker && (
        <BlockTypePicker
          title="Add section"
          defs={TOP_LEVEL_DEFS.filter((d) => !d.internal || (page.builtIn && !hasBuiltInBlock))}
          onPick={addBlock}
          onClose={() => setPicker(false)}
        />
      )}
      {settingsOpen && (
        <ConsoleModal title={isPage ? "Page settings & SEO" : "About these sections"} onClose={() => setSettingsOpen(false)} wide>
          {isPage ? (
            <div className="space-y-5">
              <label className="grid gap-1.5 text-sm font-medium">
                Page title
                <input
                  value={meta.title}
                  maxLength={200}
                  onChange={(e) => {
                    setMeta({ ...meta, title: e.target.value });
                    setDirty(true);
                  }}
                  className={inputClass}
                />
              </label>
              {!isHome && !page.builtIn && (
                <label className="grid gap-1.5 text-sm font-medium">
                  Address
                  <input
                    value={meta.path}
                    onChange={(e) => {
                      setMeta({ ...meta, path: e.target.value });
                      setDirty(true);
                    }}
                    className={inputClass}
                  />
                  <span className="text-xs font-normal text-ink-soft">For example /pricing. Changing it breaks old links to this page.</span>
                </label>
              )}
              <h2 className="pt-2 font-display text-lg font-semibold">Search & sharing</h2>
              <label className="grid gap-1.5 text-sm font-medium">
                Title in search results (optional)
                <input
                  value={meta.metaTitle}
                  maxLength={200}
                  placeholder={meta.title}
                  onChange={(e) => {
                    setMeta({ ...meta, metaTitle: e.target.value });
                    setDirty(true);
                  }}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Description in search results
                <textarea
                  value={meta.metaDescription}
                  maxLength={400}
                  rows={3}
                  onChange={(e) => {
                    setMeta({ ...meta, metaDescription: e.target.value });
                    setDirty(true);
                  }}
                  className={inputClass}
                />
                <span className="text-xs font-normal text-ink-soft">{meta.metaDescription.length}/160 recommended</span>
              </label>
              <FieldGroup
                fields={[{ key: "ogImage", label: "Image when shared on social media (optional)", kind: "image" }]}
                values={{ ogImage: meta.ogImage }}
                onChange={(v) => {
                  setMeta({ ...meta, ogImage: String(v.ogImage || "") });
                  setDirty(true);
                }}
                linkOptions={linkOptions}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={meta.noindex}
                  onChange={(e) => {
                    setMeta({ ...meta, noindex: e.target.checked });
                    setDirty(true);
                  }}
                  className="h-4 w-4"
                />
                Hide this page from search engines
              </label>
              <MergeTagHint />
              {(canGoOffline || !isHome) && (
                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  {canGoOffline && page.status === "published" && (
                    <button type="button" onClick={goOffline} disabled={busy !== null} className={button}>
                      Take offline
                    </button>
                  )}
                  {!isHome && (
                    <button type="button" onClick={removePage} disabled={busy !== null} className={`${button} text-red-600 hover:border-red-600`}>
                      {page.builtIn ? "Reset to default" : isPage ? "Delete page" : "Remove all sections"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-sm text-ink-soft">
              <p>
                These sections appear on the public {page.kind === "course" ? "course" : "tool"} page, below its main content. Add testimonials, FAQs,
                videos, a call to action, anything from the section library.
              </p>
              <p>Changes go live when you click Publish.</p>
              <MergeTagHint />
              <div className="border-t border-line pt-4">
                <button type="button" onClick={removePage} disabled={busy !== null} className={`${button} text-red-600 hover:border-red-600`}>
                  Remove all sections
                </button>
              </div>
            </div>
          )}
        </ConsoleModal>
      )}

      <header className="z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line bg-white px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (dirty) setConfirmLeave(true);
              else router.push(backHref);
            }}
            aria-label={backLabel}
            title={backLabel}
            className={iconButton}
          >
            <BackIcon />
          </button>
          <div className="flex items-center gap-0.5 rounded-lg bg-paper-soft p-0.5">
            <button type="button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)" className={`${iconButton} h-8 w-8 disabled:opacity-40`}>
              <UndoIcon />
            </button>
            <button type="button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className={`${iconButton} h-8 w-8 disabled:opacity-40`}>
              <RedoIcon />
            </button>
          </div>
          <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} aria-hidden="true" />
          <span className="truncate text-sm font-medium">{meta.title || "Untitled page"}</span>
          <span className="hidden shrink-0 text-xs text-ink-soft sm:inline">{status.label}</span>
          {error && <span role="alert" className="hidden max-w-sm truncate text-xs text-red-600 md:inline">{error}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Elements" title="Elements" className={`${iconButton} sm:hidden`}>
            <ElementsIcon />
          </button>
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
          {publicUrl && page.status === "published" && (
            <a href={publicUrl} target="_blank" rel="noreferrer" className={`${button} hidden sm:inline-flex`}>
              View live
            </a>
          )}
          <button type="button" onClick={() => void openPreview()} aria-label="Preview the unpublished page" title="Preview the unpublished page" className={iconButton}>
            <EyeIcon />
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Page settings" title="Page settings" className={iconButton}>
            <GearIcon />
          </button>
          <button type="button" onClick={() => save()} disabled={busy !== null || !dirty} className={button}>
            {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
          <button type="button" onClick={() => save({ publish: true })} disabled={busy !== null} className={primaryButton}>
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </header>

      {message && <p className="shrink-0 border-b border-line bg-paper-soft px-4 py-1.5 text-xs text-ink-soft">{message}</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDragLabel(null)}>
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {/* Below sm (e.g. inside the Mobile-width iframe) this is a full-screen
             overlay opened by the Elements button; at sm and up it's the
             persistent left rail, same single instance either way. */}
          <aside
            className={`${
              paletteOpen ? "fixed inset-0 z-40 flex flex-col bg-white" : "hidden"
            } sm:static sm:z-auto sm:flex sm:w-[210px] sm:shrink-0 sm:flex-col sm:border-r sm:border-line sm:bg-white`}
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3 sm:hidden">
              <span className="text-sm font-semibold">Elements</span>
              <button type="button" onClick={() => setPaletteOpen(false)} aria-label="Close" className={iconButton}>
                <CloseIcon />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <ElementsPalette
                defs={TOP_LEVEL_DEFS.filter((d) => !d.internal)}
                onPick={(type) => {
                  addBlock(type);
                  setPaletteOpen(false);
                }}
              />
            </div>
          </aside>

          <main className="relative min-w-0 flex-1 overflow-y-auto bg-paper-soft">
            {device === "mobile" ? (
              <div className="flex min-h-full items-start justify-center p-6">
                <div className="w-[412px] shrink-0 overflow-hidden rounded-[2rem] border-[10px] border-ink shadow-xl">
                  <MobileCanvasPortal>
                    <div className="min-h-full bg-white">
                      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                        {blocks.map((block, i) => (
                          <TopBlockFrame
                            key={block.id}
                            block={block}
                            liveData={liveData}
                            selected={selection?.blockId === block.id && !selection.elementId}
                            onSelect={() => selectBlock({ blockId: block.id })}
                            onDuplicate={block.type === "builtIn" ? undefined : () => duplicateBlock(block)}
                            onDelete={() => void removeBlock(block)}
                            renderColumn={block.type === "row" ? renderColumnFor(block.id) : undefined}
                            interactive={false}
                            onMoveUp={() => moveBlockBy(block.id, -1)}
                            onMoveDown={() => moveBlockBy(block.id, 1)}
                            canMoveUp={i > 0}
                            canMoveDown={i < blocks.length - 1}
                            editing={nodeEditingFor(block.id)}
                          />
                        ))}
                      </SortableContext>
                      <CanvasEndDropzone empty={blocks.length === 0} />
                      <div className="p-4">
                        <button type="button" onClick={() => setPicker(true)} className={`${primaryButton} w-full`}>
                          + Add section
                        </button>
                      </div>
                    </div>
                  </MobileCanvasPortal>
                </div>
              </div>
            ) : (
              <div className="min-h-full bg-white">
                <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  {blocks.map((block) => (
                    <TopBlockFrame
                      key={block.id}
                      block={block}
                      liveData={liveData}
                      selected={selection?.blockId === block.id && !selection.elementId}
                      onSelect={() => selectBlock({ blockId: block.id })}
                      onDuplicate={block.type === "builtIn" ? undefined : () => duplicateBlock(block)}
                      onDelete={() => void removeBlock(block)}
                      renderColumn={block.type === "row" ? renderColumnFor(block.id) : undefined}
                      editing={nodeEditingFor(block.id)}
                    />
                  ))}
                </SortableContext>
                <CanvasEndDropzone empty={blocks.length === 0} />
                <div className="p-4">
                  <button type="button" onClick={() => setPicker(true)} className={`${primaryButton} w-full`}>
                    + Add section
                  </button>
                </div>
              </div>
            )}
          </main>

          {settingsTarget?.def && (
            <aside className="fixed inset-0 z-40 flex flex-col bg-white sm:static sm:z-auto sm:w-[320px] sm:shrink-0 sm:border-l sm:border-line">
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3 sm:hidden">
                <span className="text-sm font-semibold">Settings</span>
                <button type="button" onClick={() => selectBlock(null)} aria-label="Close" className={iconButton}>
                  <CloseIcon />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                <SettingsPanel
                  settingsKey={settingsTarget.key}
                  title={settingsTarget.def.label}
                  description={blockSummary(settingsTarget.def)}
                  contentFields={settingsTarget.def.fields}
                  styleFieldsList={styleFields(settingsTarget.def)}
                  props={settingsTarget.props}
                  onChangeProps={settingsTarget.onChangeProps}
                  linkOptions={linkOptions}
                  onDuplicate={settingsTarget.canDuplicate ? () => selectedTopBlock && duplicateBlock(selectedTopBlock) : undefined}
                  onDelete={settingsTarget.onDelete}
                  internal={Boolean(settingsTarget.def.internal)}
                  htmlTree={htmlTree}
                />
              </div>
            </aside>
          )}
        </div>

        <DragOverlay>
          {activeDragLabel && (
            <div className="rounded-xl border border-ink bg-paper px-4 py-2.5 text-sm font-medium text-ink shadow-xl">{activeDragLabel}</div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
