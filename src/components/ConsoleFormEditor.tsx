"use client";

import { useCallback, useEffect, useState } from "react";
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
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ConsoleModal from "@/components/ConsoleModal";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  FORM_ELEMENT_PALETTE,
  isFieldElementType,
  type FormCanvasElement,
  type FormDefinition,
  type FormDesign,
  type FormElementType,
} from "@/lib/formsShape";

const button =
  "rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton =
  "rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-60";
const iconButton =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-paper-soft hover:text-ink";
const inputClass =
  "w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition focus:border-ink";

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
const GearIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="m19.4 15 .1.1 1.4 1.1-1.5 2.6-1.7-.7a8.2 8.2 0 0 1-1.7 1l-.3 1.8h-3l-.3-1.8a8.2 8.2 0 0 1-1.7-1l-1.7.7-1.5-2.6 1.4-1.1a7.6 7.6 0 0 1 0-2l-1.4-1.1 1.5-2.6 1.7.7a8.2 8.2 0 0 1 1.7-1l.3-1.8h3l.3 1.8a8.2 8.2 0 0 1 1.7 1l1.7-.7 1.5 2.6-1.4 1.1a7.6 7.6 0 0 1 0 2Z" />
  </svg>
);
const PaletteIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6h1.9c4 0 7.4-3.4 7.4-7.4 0-5.2-4.5-9.3-10-9.3z" />
  </svg>
);
const CloseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const DragHandleIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-ink-soft cursor-grab active:cursor-grabbing" fill="currentColor">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);
const TrashIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const CopyIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const CheckIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

let elementCounter = 0;
function nextElementId(prefix = "elem"): string {
  elementCounter += 1;
  return `${prefix}_${elementCounter}_${Date.now().toString(36)}`;
}

function createElement(type: FormElementType): FormCanvasElement {
  const id = nextElementId();
  switch (type) {
    case "heading":
      return { id, type, headingText: "Headline", headingLevel: "h2", headingAlign: "left" };
    case "text":
      return { id, type, textContent: "Add descriptive text or instructions here.", textMuted: false, textAlign: "left" };
    case "text_input":
      return { id, type, fieldLabel: "Text field", fieldKey: "text_field", fieldPlaceholder: "", fieldRequired: false };
    case "email":
      return { id, type, fieldLabel: "Email address", fieldKey: "email", fieldPlaceholder: "you@example.com", fieldRequired: true };
    case "phone":
      return { id, type, fieldLabel: "Phone number", fieldKey: "phone", fieldPlaceholder: "+1 (555) 000-0000", fieldRequired: false };
    case "textarea":
      return { id, type, fieldLabel: "Message", fieldKey: "message", fieldPlaceholder: "Type your message...", fieldRequired: false };
    case "select":
      return { id, type, fieldLabel: "Select option", fieldKey: "choice", fieldOptions: "Option 1, Option 2, Option 3", fieldRequired: false };
    case "checkbox":
      return { id, type, fieldLabel: "I agree to the terms and privacy policy", fieldKey: "consent", fieldRequired: true };
    case "number":
      return { id, type, fieldLabel: "Quantity / Amount", fieldKey: "quantity", fieldRequired: false };
    case "hidden":
      return { id, type, fieldLabel: "UTM Source", fieldKey: "utm_source", fieldDefaultValue: "website", fieldRequired: false };
    case "button":
      return { id, type, buttonLabel: "Submit", buttonAlign: "full", buttonVariant: "primary" };
    case "divider":
      return { id, type, dividerSpacing: "md" };
  }
}

function SortableElementItem({
  element,
  selected,
  onSelect,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  design,
  isFixed,
}: {
  element: FormCanvasElement;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  design: FormDesign;
  isFixed: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: element.id,
    disabled: isFixed,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const inputStyle = {
    borderColor: design.borderColor || undefined,
    borderRadius: design.borderRadius || undefined,
    color: design.textColor || undefined,
  };

  const buttonStyle = {
    backgroundColor: design.buttonColor || undefined,
    color: design.buttonTextColor || undefined,
    borderRadius: design.borderRadius || undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`group relative mb-3 rounded-xl border p-4 transition-all ${
        isDragging ? "opacity-30" : ""
      } ${
        selected
          ? "border-ink bg-paper shadow-md ring-2 ring-ink/10"
          : "border-transparent bg-paper hover:border-line hover:shadow-sm"
      }`}
    >
      {/* Action Toolbar on hover / selection */}
      <div
        className={`absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-line bg-white p-0.5 shadow-sm transition-opacity ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {!isFixed && (
          <div {...attributes} {...listeners} className="p-1 hover:bg-paper-soft rounded cursor-grab">
            <DragHandleIcon />
          </div>
        )}
        <button
          type="button"
          disabled={!canMoveUp || isFixed}
          onClick={onMoveUp}
          title="Move up"
          className="p-1 text-xs text-ink-soft hover:bg-paper-soft hover:text-ink disabled:opacity-30"
        >
          ▲
        </button>
        <button
          type="button"
          disabled={!canMoveDown || isFixed}
          onClick={onMoveDown}
          title="Move down"
          className="p-1 text-xs text-ink-soft hover:bg-paper-soft hover:text-ink disabled:opacity-30"
        >
          ▼
        </button>
        {!isFixed && (
          <>
            <button
              type="button"
              onClick={onDuplicate}
              title="Duplicate"
              className="p-1 text-xs text-ink-soft hover:bg-paper-soft hover:text-ink"
            >
              <CopyIcon />
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Delete"
              className="p-1 text-xs text-red-600 hover:bg-red-50"
            >
              <TrashIcon />
            </button>
          </>
        )}
      </div>

      {/* Live Preview of Element */}
      {element.type === "heading" && (
        <div style={{ textAlign: element.headingAlign || "left" }}>
          {element.headingLevel === "h1" ? (
            <h1 className="text-2xl font-bold tracking-tight text-ink">{element.headingText || "Headline"}</h1>
          ) : element.headingLevel === "h3" ? (
            <h3 className="text-lg font-semibold text-ink">{element.headingText || "Headline"}</h3>
          ) : element.headingLevel === "h4" ? (
            <h4 className="text-base font-semibold text-ink">{element.headingText || "Headline"}</h4>
          ) : (
            <h2 className="text-xl font-bold tracking-tight text-ink">{element.headingText || "Headline"}</h2>
          )}
        </div>
      )}

      {element.type === "text" && (
        <p
          style={{ textAlign: element.textAlign || "left" }}
          className={`text-sm ${element.textMuted ? "text-ink-soft" : "text-ink"}`}
        >
          {element.textContent || "Paragraph text"}
        </p>
      )}

      {element.type === "divider" && (
        <div className={element.dividerSpacing === "lg" ? "py-4" : element.dividerSpacing === "sm" ? "py-1" : "py-2"}>
          <hr className="border-line" />
        </div>
      )}

      {element.type === "hidden" && (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-line bg-paper-soft px-3 py-2 text-xs text-ink-soft">
          <span className="font-mono font-medium">Hidden tracking: {element.fieldKey || "param"}</span>
          <span>Value: &quot;{element.fieldDefaultValue || ""}&quot;</span>
        </div>
      )}

      {isFieldElementType(element.type) && element.type !== "hidden" && (
        <div className="space-y-1.5">
          <label className="flex items-center gap-1 text-sm font-medium text-ink">
            {element.fieldLabel || "Field label"}
            {element.fieldRequired && <span className="text-red-500">*</span>}
          </label>

          {element.type === "textarea" ? (
            <textarea
              readOnly
              placeholder={element.fieldPlaceholder}
              rows={3}
              style={inputStyle}
              className="w-full resize-none rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none cursor-default"
            />
          ) : element.type === "select" ? (
            <select
              disabled
              style={inputStyle}
              className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none cursor-default text-ink-soft"
            >
              <option>{element.fieldPlaceholder || "Select an option..."}</option>
              {(element.fieldOptions || "")
                .split(",")
                .filter(Boolean)
                .map((opt, i) => (
                  <option key={i}>{opt.trim()}</option>
                ))}
            </select>
          ) : element.type === "checkbox" ? (
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" disabled className="h-4 w-4 rounded border-line" />
              <span className="text-sm text-ink-soft">{element.fieldLabel || "Checkbox option"}</span>
            </div>
          ) : (
            <input
              type="text"
              readOnly
              placeholder={element.fieldPlaceholder}
              style={inputStyle}
              className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none cursor-default"
            />
          )}
        </div>
      )}

      {element.type === "button" && (
        <div
          className={`flex ${
            element.buttonAlign === "center"
              ? "justify-center"
              : element.buttonAlign === "right"
                ? "justify-end"
                : element.buttonAlign === "left"
                  ? "justify-start"
                  : "w-full"
          }`}
        >
          <button
            type="button"
            style={buttonStyle}
            className={`${
              element.buttonAlign === "full" ? "w-full" : ""
            } rounded-xl bg-ink px-6 py-2.5 text-sm font-medium text-paper shadow-sm`}
          >
            {element.buttonLabel || "Submit"}
          </button>
        </div>
      )}
    </div>
  );
}

function CanvasEndDropzone({ empty }: { empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-end" });
  return (
    <div
      ref={setNodeRef}
      className={`transition-colors rounded-xl border-2 border-dashed ${
        isOver ? "border-ink bg-paper-soft" : "border-line"
      } ${empty ? "p-16 text-center text-sm text-ink-soft" : "h-12 flex items-center justify-center text-xs text-ink-soft"}`}
    >
      {empty
        ? "Canvas is empty. Drag an element here from the left palette, or click one to add it."
        : "+ Drop element here"}
    </div>
  );
}

export default function ConsoleFormEditor({
  initialForm,
  backHref,
  backLabel,
}: {
  initialForm: FormDefinition;
  backHref: string;
  backLabel: string;
}) {
  const router = useRouter();
  const { dialog } = useConfirm();

  const [formName, setFormName] = useState(initialForm.name);
  const [slug, setSlug] = useState(initialForm.slug || "");
  const [elements, setElements] = useState<FormCanvasElement[]>(initialForm.elements || []);
  const [design, setDesign] = useState<FormDesign>(initialForm.design);
  const [submissionAction, setSubmissionAction] = useState<"message" | "redirect">(
    initialForm.submissionAction || "message",
  );
  const [redirectUrl, setRedirectUrl] = useState(initialForm.redirectUrl || "");
  const [successHeading, setSuccessHeading] = useState(initialForm.successHeading || "Thank you!");
  const [successText, setSuccessText] = useState(
    initialForm.successText || "We have received your submission.",
  );
  const [notifyEmail, setNotifyEmail] = useState(initialForm.notifyEmail || "");
  const [verifyEmail, setVerifyEmail] = useState(initialForm.verifyEmail === true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"inspector" | "design">("inspector");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Undo / Redo history
  const [history, setHistory] = useState<{ past: FormCanvasElement[][]; future: FormCanvasElement[][] }>({
    past: [],
    future: [],
  });

  const updateElements = useCallback(
    (next: FormCanvasElement[]) => {
      setHistory((h) => ({ past: [...h.past, elements].slice(-100), future: [] }));
      setElements(next);
      setDirty(true);
      setMessage("");
    },
    [elements],
  );

  const undo = useCallback(() => {
    if (history.past.length === 0) return;
    const prev = history.past[history.past.length - 1];
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [...h.future, elements] }));
    setSelectedId(null);
    setElements(prev);
    setDirty(true);
  }, [history, elements]);

  const redo = useCallback(() => {
    if (history.future.length === 0) return;
    const next = history.future[history.future.length - 1];
    setHistory((h) => ({ past: [...h.past, elements], future: h.future.slice(0, -1) }));
    setSelectedId(null);
    setElements(next);
    setDirty(true);
  }, [history, elements]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        if (e.shiftKey) redo();
        else undo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function addElement(type: FormElementType) {
    const newEl = createElement(type);
    updateElements([...elements, newEl]);
    setSelectedId(newEl.id);
    setActiveTab("inspector");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const data = active.data.current as { kind?: string; elementType?: FormElementType } | undefined;
    if (data?.kind === "palette" && data.elementType) {
      const index =
        over.id === "canvas-end"
          ? elements.length
          : Math.max(0, elements.findIndex((el) => el.id === over.id));
      const newEl = createElement(data.elementType);
      updateElements([...elements.slice(0, index), newEl, ...elements.slice(index)]);
      setSelectedId(newEl.id);
      setActiveTab("inspector");
      return;
    }

    const oldIndex = elements.findIndex((el) => el.id === active.id);
    if (oldIndex < 0) return;
    const newIndex =
      over.id === "canvas-end" ? elements.length - 1 : elements.findIndex((el) => el.id === over.id);
    if (newIndex < 0 || oldIndex === newIndex) return;
    updateElements(arrayMove(elements, oldIndex, newIndex));
  }

  function updateSelectedProps(patch: Partial<FormCanvasElement>) {
    if (!selectedId) return;
    updateElements(
      elements.map((el) => (el.id === selectedId ? ({ ...el, ...patch } as FormCanvasElement) : el)),
    );
  }

  function deleteElement(id: string) {
    if (initialForm.isFixed) return;
    updateElements(elements.filter((el) => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function duplicateElement(id: string) {
    if (initialForm.isFixed) return;
    const idx = elements.findIndex((el) => el.id === id);
    if (idx < 0) return;
    const clone: FormCanvasElement = {
      ...elements[idx],
      id: nextElementId(),
      fieldKey: elements[idx].fieldKey ? `${elements[idx].fieldKey}_copy` : undefined,
    };
    updateElements([...elements.slice(0, idx + 1), clone, ...elements.slice(idx + 1)]);
    setSelectedId(clone.id);
  }

  function moveElement(idx: number, delta: number) {
    const target = idx + delta;
    if (target < 0 || target >= elements.length) return;
    updateElements(arrayMove(elements, idx, target));
  }

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");

    const payload = {
      name: formName.trim() || "Untitled form",
      slug: slug.trim() || undefined,
      elements,
      design,
      submissionAction,
      redirectUrl,
      successHeading,
      successText,
      notifyEmail,
      verifyEmail,
    };

    const res = await fetch(`/api/v1/forms/${initialForm.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Could not save the form.");
      return false;
    }

    setDirty(false);
    setMessage("Changes saved.");
    setTimeout(() => setMessage(""), 3000);
    return true;
  }

  const selectedElement = elements.find((el) => el.id === selectedId) || null;

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white text-ink">
      {dialog}

      {/* Confirmation modal on leaving with unsaved changes */}
      {confirmLeave && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/40 px-6">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-paper p-6 shadow-xl">
            <p className="text-sm font-semibold">Leave without saving?</p>
            <p className="mt-1 text-sm text-ink-soft">
              You have unsaved changes in your form. Save them now or leave and discard them.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:border-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirty(false);
                  router.push(backHref);
                }}
                className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:border-red-600"
              >
                Leave without saving
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (await save()) router.push(backHref);
                }}
                className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper hover:opacity-85"
              >
                {busy ? "Saving…" : "Save & leave"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form Settings Modal */}
      {settingsOpen && (
        <ConsoleModal title="Form settings & submission outcome" onClose={() => setSettingsOpen(false)} wide>
          <div className="space-y-5">
            <label className="grid gap-1.5 text-sm font-medium">
              Form name
              <input
                value={formName}
                maxLength={100}
                onChange={(e) => {
                  setFormName(e.target.value);
                  setDirty(true);
                }}
                className={inputClass}
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium">
              Direct shareable address
              <div className="flex items-center gap-1">
                <span className="text-sm text-ink-soft">/f/</span>
                <input
                  value={slug}
                  maxLength={80}
                  placeholder="feedback"
                  onChange={(e) => {
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-")
                        .replace(/^-+|-+$/g, ""),
                    );
                    setDirty(true);
                  }}
                  className={inputClass}
                />
              </div>
              <span className="text-xs text-ink-soft">
                Visitors can access this form directly at /f/{slug || "slug"}.
              </span>
            </label>

            <div className="rounded-xl border border-line p-4 space-y-3">
              <h3 className="text-sm font-semibold text-ink">Two-step email verification</h3>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifyEmail}
                  onChange={(e) => {
                    setVerifyEmail(e.target.checked);
                    setDirty(true);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-line"
                />
                <div>
                  <span className="font-medium text-ink">Verify email with one-time passcode (OTP)</span>
                  <p className="text-xs text-ink-soft">
                    When enabled, submitting sends a verification code to the visitor&apos;s email. The submission is only recorded once confirmed.
                  </p>
                </div>
              </label>
            </div>

            <div className="rounded-xl border border-line p-4 space-y-4">
              <h3 className="text-sm font-semibold text-ink">After submission outcome</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="submissionAction"
                    value="message"
                    checked={submissionAction === "message"}
                    onChange={() => {
                      setSubmissionAction("message");
                      setDirty(true);
                    }}
                  />
                  <span>Show confirmation message on the page</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="submissionAction"
                    value="redirect"
                    checked={submissionAction === "redirect"}
                    onChange={() => {
                      setSubmissionAction("redirect");
                      setDirty(true);
                    }}
                  />
                  <span>Redirect to thank you page or custom URL</span>
                </label>
              </div>

              {submissionAction === "redirect" ? (
                <label className="grid gap-1.5 text-sm font-medium pt-2">
                  Thank you page URL
                  <input
                    value={redirectUrl}
                    placeholder="/thank-you or https://example.com/thanks"
                    onChange={(e) => {
                      setRedirectUrl(e.target.value);
                      setDirty(true);
                    }}
                    className={inputClass}
                  />
                </label>
              ) : (
                <div className="grid gap-3 pt-2">
                  <label className="grid gap-1.5 text-sm font-medium">
                    Success heading
                    <input
                      value={successHeading}
                      onChange={(e) => {
                        setSuccessHeading(e.target.value);
                        setDirty(true);
                      }}
                      className={inputClass}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Success text
                    <textarea
                      value={successText}
                      rows={2}
                      onChange={(e) => {
                        setSuccessText(e.target.value);
                        setDirty(true);
                      }}
                      className={inputClass}
                    />
                  </label>
                </div>
              )}
            </div>

            <label className="grid gap-1.5 text-sm font-medium">
              Notify email on submission (optional)
              <input
                type="email"
                value={notifyEmail}
                placeholder="notifications@example.com"
                onChange={(e) => {
                  setNotifyEmail(e.target.value);
                  setDirty(true);
                }}
                className={inputClass}
              />
            </label>
          </div>
        </ConsoleModal>
      )}

      {/* Top Header */}
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
            <button
              type="button"
              onClick={undo}
              disabled={history.past.length === 0}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              className={`${iconButton} h-8 w-8 disabled:opacity-40`}
            >
              <UndoIcon />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={history.future.length === 0}
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              className={`${iconButton} h-8 w-8 disabled:opacity-40`}
            >
              <RedoIcon />
            </button>
          </div>

          <span
            className={`h-2 w-2 shrink-0 rounded-full ${dirty ? "bg-amber-500" : "bg-green-500"}`}
            aria-hidden="true"
          />

          <input
            value={formName}
            onChange={(e) => {
              setFormName(e.target.value);
              setDirty(true);
            }}
            className="truncate font-medium text-sm text-ink bg-transparent border-b border-transparent hover:border-line focus:border-ink outline-none px-1 py-0.5"
            placeholder="Form name"
          />

          {initialForm.isFixed && (
            <span className="hidden sm:inline-block rounded-full bg-paper-soft px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
              Auth System Form
            </span>
          )}

          {error && <span className="hidden md:inline text-xs text-red-600 truncate">{error}</span>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Elements"
            title="Elements"
            className={`${iconButton} sm:hidden`}
          >
            +
          </button>

          <div className="flex items-center gap-0.5 rounded-lg bg-paper-soft p-0.5">
            <button
              type="button"
              onClick={() => setDevice("desktop")}
              aria-label="Desktop"
              title="Desktop preview"
              className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                device === "desktop" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              <DesktopIcon />
            </button>
            <button
              type="button"
              onClick={() => setDevice("mobile")}
              aria-label="Mobile"
              title="Mobile preview"
              className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                device === "mobile" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              <MobileIcon />
            </button>
          </div>

          {slug && (
            <a
              href={`/f/${slug}`}
              target="_blank"
              rel="noreferrer"
              className={`${button} hidden sm:inline-flex`}
            >
              View live
            </a>
          )}

          {slug && (
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/f/${slug}`;
                navigator.clipboard.writeText(url);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
              }}
              aria-label="Copy shareable link"
              title="Copy shareable link"
              className={iconButton}
            >
              {copiedLink ? <CheckIcon /> : <CopyIcon />}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveTab("design");
              setSelectedId(null);
            }}
            aria-label="Form Design System"
            title="Form Design System"
            className={`${iconButton} ${activeTab === "design" ? "bg-paper-soft text-ink" : ""}`}
          >
            <PaletteIcon />
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Form settings"
            title="Form settings"
            className={iconButton}
          >
            <GearIcon />
          </button>

          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className={primaryButton}
          >
            {busy ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </header>

      {message && (
        <p className="shrink-0 border-b border-line bg-paper-soft px-4 py-1 text-xs text-ink-soft">
          {message}
        </p>
      )}

      {/* Studio 3-Column Layout */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {/* Left Sidebar: Palette */}
          <aside
            className={`${
              paletteOpen ? "fixed inset-0 z-40 flex flex-col bg-white" : "hidden"
            } sm:static sm:z-auto sm:flex sm:w-[220px] sm:shrink-0 sm:flex-col sm:border-r sm:border-line sm:bg-white`}
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3 sm:hidden">
              <span className="text-sm font-semibold">Elements</span>
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                aria-label="Close"
                className={iconButton}
              >
                <CloseIcon />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-4">
              <div>
                <span className="px-1 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Layout
                </span>
                <div className="mt-2 space-y-1">
                  {FORM_ELEMENT_PALETTE.filter((p) => p.category === "layout").map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        addElement(item.type);
                        setPaletteOpen(false);
                      }}
                      className="w-full text-left rounded-xl border border-line bg-paper px-3 py-2 text-sm font-medium hover:border-ink hover:bg-paper-soft transition flex items-center justify-between"
                    >
                      <span>{item.label}</span>
                      <span className="text-xs text-ink-soft">+</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="px-1 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Form Fields
                </span>
                <div className="mt-2 space-y-1">
                  {FORM_ELEMENT_PALETTE.filter((p) => p.category === "fields").map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        addElement(item.type);
                        setPaletteOpen(false);
                      }}
                      className="w-full text-left rounded-xl border border-line bg-paper px-3 py-2 text-sm font-medium hover:border-ink hover:bg-paper-soft transition flex items-center justify-between"
                    >
                      <span>{item.label}</span>
                      <span className="text-xs text-ink-soft">+</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="px-1 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Actions
                </span>
                <div className="mt-2 space-y-1">
                  {FORM_ELEMENT_PALETTE.filter((p) => p.category === "action").map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        addElement(item.type);
                        setPaletteOpen(false);
                      }}
                      className="w-full text-left rounded-xl border border-line bg-paper px-3 py-2 text-sm font-medium hover:border-ink hover:bg-paper-soft transition flex items-center justify-between"
                    >
                      <span>{item.label}</span>
                      <span className="text-xs text-ink-soft">+</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Center Canvas */}
          <main
            onClick={() => setSelectedId(null)}
            className="relative min-w-0 flex-1 overflow-y-auto bg-paper-soft p-4 sm:p-8 flex items-start justify-center"
          >
            <div
              className={`w-full transition-all duration-200 ${
                device === "mobile" ? "max-w-[412px]" : "max-w-xl"
              }`}
            >
              <div
                style={{
                  backgroundColor: design.backgroundColor || "#ffffff",
                  fontFamily: design.fontFamily || undefined,
                }}
                className="min-h-[300px] rounded-2xl border border-line p-6 shadow-sm bg-white"
              >
                <SortableContext
                  items={elements.map((el) => el.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {elements.map((element, i) => (
                    <SortableElementItem
                      key={element.id}
                      element={element}
                      selected={selectedId === element.id}
                      onSelect={() => {
                        setSelectedId(element.id);
                        setActiveTab("inspector");
                      }}
                      onDelete={() => deleteElement(element.id)}
                      onDuplicate={() => duplicateElement(element.id)}
                      onMoveUp={() => moveElement(i, -1)}
                      onMoveDown={() => moveElement(i, 1)}
                      canMoveUp={i > 0}
                      canMoveDown={i < elements.length - 1}
                      design={design}
                      isFixed={initialForm.isFixed}
                    />
                  ))}
                </SortableContext>

                <CanvasEndDropzone empty={elements.length === 0} />
              </div>
            </div>
          </main>

          {/* Right Sidebar: Inspector & Design */}
          <aside className="hidden lg:flex lg:w-[320px] lg:shrink-0 lg:flex-col lg:border-l lg:border-line lg:bg-white">
            <div className="flex border-b border-line">
              <button
                type="button"
                onClick={() => setActiveTab("inspector")}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider text-center border-b-2 transition ${
                  activeTab === "inspector"
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                Inspector
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("design")}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider text-center border-b-2 transition ${
                  activeTab === "design"
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                Design System
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === "design" ? (
                /* Form Design Tokens Tab */
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-ink">Form Visual Design</h3>
                  <p className="text-xs text-ink-soft">
                    Custom visual styling applied independently from page and site themes.
                  </p>

                  <label className="grid gap-1.5 text-xs font-medium">
                    Submit Button Background
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={design.buttonColor || "#000000"}
                        onChange={(e) => {
                          setDesign({ ...design, buttonColor: e.target.value });
                          setDirty(true);
                        }}
                        className="h-8 w-8 cursor-pointer rounded border border-line"
                      />
                      <input
                        value={design.buttonColor}
                        placeholder="#000000"
                        onChange={(e) => {
                          setDesign({ ...design, buttonColor: e.target.value });
                          setDirty(true);
                        }}
                        className={inputClass}
                      />
                    </div>
                  </label>

                  <label className="grid gap-1.5 text-xs font-medium">
                    Submit Button Text Color
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={design.buttonTextColor || "#ffffff"}
                        onChange={(e) => {
                          setDesign({ ...design, buttonTextColor: e.target.value });
                          setDirty(true);
                        }}
                        className="h-8 w-8 cursor-pointer rounded border border-line"
                      />
                      <input
                        value={design.buttonTextColor}
                        placeholder="#ffffff"
                        onChange={(e) => {
                          setDesign({ ...design, buttonTextColor: e.target.value });
                          setDirty(true);
                        }}
                        className={inputClass}
                      />
                    </div>
                  </label>

                  <label className="grid gap-1.5 text-xs font-medium">
                    Input Border Color
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={design.borderColor || "#e5e7eb"}
                        onChange={(e) => {
                          setDesign({ ...design, borderColor: e.target.value });
                          setDirty(true);
                        }}
                        className="h-8 w-8 cursor-pointer rounded border border-line"
                      />
                      <input
                        value={design.borderColor}
                        placeholder="#e5e7eb"
                        onChange={(e) => {
                          setDesign({ ...design, borderColor: e.target.value });
                          setDirty(true);
                        }}
                        className={inputClass}
                      />
                    </div>
                  </label>

                  <label className="grid gap-1.5 text-xs font-medium">
                    Form Background Color
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={design.backgroundColor || "#ffffff"}
                        onChange={(e) => {
                          setDesign({ ...design, backgroundColor: e.target.value });
                          setDirty(true);
                        }}
                        className="h-8 w-8 cursor-pointer rounded border border-line"
                      />
                      <input
                        value={design.backgroundColor}
                        placeholder="#ffffff"
                        onChange={(e) => {
                          setDesign({ ...design, backgroundColor: e.target.value });
                          setDirty(true);
                        }}
                        className={inputClass}
                      />
                    </div>
                  </label>

                  <label className="grid gap-1.5 text-xs font-medium">
                    Corner Radius
                    <select
                      value={design.borderRadius}
                      onChange={(e) => {
                        setDesign({ ...design, borderRadius: e.target.value });
                        setDirty(true);
                      }}
                      className={inputClass}
                    >
                      <option value="">Theme default</option>
                      <option value="0px">Sharp (0px)</option>
                      <option value="6px">Small (6px)</option>
                      <option value="12px">Rounded (12px)</option>
                      <option value="16px">Extra Rounded (16px)</option>
                      <option value="9999px">Pill (9999px)</option>
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-xs font-medium">
                    Font Family
                    <select
                      value={design.fontFamily}
                      onChange={(e) => {
                        setDesign({ ...design, fontFamily: e.target.value });
                        setDirty(true);
                      }}
                      className={inputClass}
                    >
                      <option value="">Theme default</option>
                      <option value="system-ui, sans-serif">Modern Sans-Serif</option>
                      <option value="Georgia, serif">Editorial Serif</option>
                      <option value="monospace">Monospace</option>
                    </select>
                  </label>
                </div>
              ) : selectedElement ? (
                /* Element Inspector Tab */
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <span className="text-sm font-semibold capitalize text-ink">
                      {selectedElement.type.replace("_", " ")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="text-xs text-ink-soft hover:text-ink"
                    >
                      Deselect
                    </button>
                  </div>

                  {selectedElement.type === "heading" && (
                    <>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Heading text
                        <input
                          value={selectedElement.headingText || ""}
                          onChange={(e) => updateSelectedProps({ headingText: e.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Heading level
                        <select
                          value={selectedElement.headingLevel || "h2"}
                          onChange={(e) =>
                            updateSelectedProps({
                              headingLevel: e.target.value as "h1" | "h2" | "h3" | "h4",
                            })
                          }
                          className={inputClass}
                        >
                          <option value="h1">Heading 1</option>
                          <option value="h2">Heading 2</option>
                          <option value="h3">Heading 3</option>
                          <option value="h4">Heading 4</option>
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Alignment
                        <select
                          value={selectedElement.headingAlign || "left"}
                          onChange={(e) =>
                            updateSelectedProps({
                              headingAlign: e.target.value as "left" | "center" | "right",
                            })
                          }
                          className={inputClass}
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </label>
                    </>
                  )}

                  {selectedElement.type === "text" && (
                    <>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Paragraph text
                        <textarea
                          rows={4}
                          value={selectedElement.textContent || ""}
                          onChange={(e) => updateSelectedProps({ textContent: e.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedElement.textMuted === true}
                          onChange={(e) => updateSelectedProps({ textMuted: e.target.checked })}
                          className="h-4 w-4 rounded border-line"
                        />
                        <span>Muted text color</span>
                      </label>
                    </>
                  )}

                  {isFieldElementType(selectedElement.type) && (
                    <>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Field label
                        <input
                          value={selectedElement.fieldLabel || ""}
                          onChange={(e) => updateSelectedProps({ fieldLabel: e.target.value })}
                          className={inputClass}
                        />
                      </label>

                      <label className="grid gap-1.5 text-xs font-medium">
                        Submission Key / Name
                        <input
                          value={selectedElement.fieldKey || ""}
                          placeholder="field_key"
                          onChange={(e) =>
                            updateSelectedProps({
                              fieldKey: e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9_]/g, "_")
                                .replace(/^_+|_+$/g, ""),
                            })
                          }
                          className={inputClass}
                        />
                        <span className="text-[10px] text-ink-soft">
                          Key under which this value is stored in submissions.
                        </span>
                      </label>

                      {selectedElement.type !== "hidden" && selectedElement.type !== "checkbox" && (
                        <label className="grid gap-1.5 text-xs font-medium">
                          Placeholder text
                          <input
                            value={selectedElement.fieldPlaceholder || ""}
                            onChange={(e) => updateSelectedProps({ fieldPlaceholder: e.target.value })}
                            className={inputClass}
                          />
                        </label>
                      )}

                      {selectedElement.type === "select" && (
                        <label className="grid gap-1.5 text-xs font-medium">
                          Options (comma-separated)
                          <textarea
                            rows={3}
                            value={selectedElement.fieldOptions || ""}
                            onChange={(e) => updateSelectedProps({ fieldOptions: e.target.value })}
                            placeholder="Option 1, Option 2, Option 3"
                            className={inputClass}
                          />
                        </label>
                      )}

                      {selectedElement.type === "hidden" ? (
                        <label className="grid gap-1.5 text-xs font-medium">
                          Default tracking value
                          <input
                            value={selectedElement.fieldDefaultValue || ""}
                            placeholder="e.g. utm_campaign_source"
                            onChange={(e) => updateSelectedProps({ fieldDefaultValue: e.target.value })}
                            className={inputClass}
                          />
                        </label>
                      ) : (
                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={selectedElement.fieldRequired === true}
                            onChange={(e) => updateSelectedProps({ fieldRequired: e.target.checked })}
                            className="h-4 w-4 rounded border-line"
                          />
                          <span>Required field</span>
                        </label>
                      )}
                    </>
                  )}

                  {selectedElement.type === "button" && (
                    <>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Button label
                        <input
                          value={selectedElement.buttonLabel || ""}
                          onChange={(e) => updateSelectedProps({ buttonLabel: e.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Button width / alignment
                        <select
                          value={selectedElement.buttonAlign || "full"}
                          onChange={(e) =>
                            updateSelectedProps({
                              buttonAlign: e.target.value as "full" | "left" | "center" | "right",
                            })
                          }
                          className={inputClass}
                        >
                          <option value="full">Full width</option>
                          <option value="left">Left aligned</option>
                          <option value="center">Centered</option>
                          <option value="right">Right aligned</option>
                        </select>
                      </label>
                    </>
                  )}

                  {selectedElement.type === "divider" && (
                    <label className="grid gap-1.5 text-xs font-medium">
                      Spacing
                      <select
                        value={selectedElement.dividerSpacing || "md"}
                        onChange={(e) =>
                          updateSelectedProps({
                            dividerSpacing: e.target.value as "sm" | "md" | "lg",
                          })
                        }
                        className={inputClass}
                      >
                        <option value="sm">Small</option>
                        <option value="md">Medium</option>
                        <option value="lg">Large</option>
                      </select>
                    </label>
                  )}

                  {!initialForm.isFixed && (
                    <div className="pt-4 border-t border-line">
                      <button
                        type="button"
                        onClick={() => deleteElement(selectedElement.id)}
                        className="w-full rounded-xl border border-red-200 bg-red-50 py-2 text-xs font-medium text-red-600 hover:border-red-600"
                      >
                        Delete element
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* No element selected: Form Overview */
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-ink">Form Overview</h3>
                  <div className="rounded-xl border border-line bg-paper-soft p-3 text-xs text-ink-soft space-y-1">
                    <p>
                      <strong>Elements:</strong> {elements.length}
                    </p>
                    <p>
                      <strong>Fields:</strong> {elements.filter((e) => isFieldElementType(e.type)).length}
                    </p>
                    <p>
                      <strong>Slug:</strong> {slug ? `/f/${slug}` : "None"}
                    </p>
                  </div>
                  <p className="text-xs text-ink-soft">
                    Select any element on the canvas to configure its properties, or click &quot;Design System&quot; to change colors and fonts.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>

        <DragOverlay>
          <div className="rounded-xl border border-ink bg-paper px-4 py-2.5 text-sm font-medium text-ink shadow-xl">
            Dragging element
          </div>
        </DragOverlay>
      </DndContext>
    </div>
  );
}
