"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
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
  "w-full rounded-xl border border-line bg-paper px-3.5 py-2 text-sm outline-none transition focus:border-ink focus:ring-1 focus:ring-ink";

let elementCounter = 0;
function nextElementId(prefix = "elem"): string {
  elementCounter += 1;
  return `${prefix}_${elementCounter}_${Date.now().toString(36)}`;
}

// ── Icons ───────────────────────────────────────────────────────────────────

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

// Element category and icon mapper
function ElementIcon({ type, className = "h-5 w-5" }: { type: FormElementType; className?: string }) {
  switch (type) {
    case "heading":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12h16M4 6v12M20 6v12" />
        </svg>
      );
    case "text":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      );
    case "text_input":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="6" width="18" height="12" rx="2" /><path d="M8 12h8" />
        </svg>
      );
    case "email":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
        </svg>
      );
    case "phone":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    case "textarea":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" />
        </svg>
      );
    case "select":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="6" width="18" height="12" rx="2" /><path d="m15 11 2 2 2-2" />
        </svg>
      );
    case "checkbox":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "number":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
        </svg>
      );
    case "hidden":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      );
    case "button":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="6" width="16" height="12" rx="3" /><circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
      );
    case "divider":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      );
  }
}

const PALETTE_GROUPS: {
  group: string;
  items: { type: FormElementType; label: string }[];
}[] = [
  {
    group: "Layout",
    items: [
      { type: "heading", label: "Heading" },
      { type: "text", label: "Text" },
      { type: "divider", label: "Divider" },
    ],
  },
  {
    group: "Fields",
    items: [
      { type: "text_input", label: "Text input" },
      { type: "email", label: "Email" },
      { type: "phone", label: "Phone" },
      { type: "textarea", label: "Long text" },
      { type: "select", label: "Dropdown" },
      { type: "checkbox", label: "Checkbox" },
      { type: "number", label: "Number" },
      { type: "hidden", label: "Hidden" },
    ],
  },
  {
    group: "Action",
    items: [{ type: "button", label: "Submit" }],
  },
];

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

// ── Left Palette Draggable Tile ─────────────────────────────────────────────

function PaletteTile({
  item,
  onPick,
}: {
  item: { type: FormElementType; label: string };
  onPick: (type: FormElementType) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${item.type}`,
    data: { kind: "palette", elementType: item.type },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onPick(item.type)}
      className={`flex cursor-grab touch-none flex-col items-center gap-1.5 rounded-xl border border-line bg-paper px-2 py-2.5 text-center transition-colors hover:border-ink hover:bg-paper-soft active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <ElementIcon type={item.type} className="h-5 w-5 text-ink-soft" />
      <span className="text-[11px] font-medium leading-tight text-ink">{item.label}</span>
    </button>
  );
}

// ── Canvas Sortable Element Item ────────────────────────────────────────────

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
  onUpdateProps,
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
  onUpdateProps: (patch: Partial<FormCanvasElement>) => void;
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
      {/* Floating Action Toolbar on hover / selection */}
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

      {/* Live Preview with Direct Inline Canvas Editing */}
      {element.type === "heading" && (
        <div style={{ textAlign: element.headingAlign || "left" }}>
          <input
            value={element.headingText || ""}
            onChange={(e) => onUpdateProps({ headingText: e.target.value })}
            placeholder="Headline"
            className={`w-full bg-transparent outline-none font-bold tracking-tight text-ink border-b border-transparent hover:border-line focus:border-ink ${
              element.headingLevel === "h1"
                ? "text-2xl"
                : element.headingLevel === "h3"
                  ? "text-lg"
                  : element.headingLevel === "h4"
                    ? "text-base"
                    : "text-xl"
            }`}
          />
        </div>
      )}

      {element.type === "text" && (
        <div style={{ textAlign: element.textAlign || "left" }}>
          <textarea
            rows={2}
            value={element.textContent || ""}
            onChange={(e) => onUpdateProps({ textContent: e.target.value })}
            placeholder="Paragraph text"
            className={`w-full resize-none bg-transparent outline-none text-sm border-b border-transparent hover:border-line focus:border-ink ${
              element.textMuted ? "text-ink-soft" : "text-ink"
            }`}
          />
        </div>
      )}

      {element.type === "divider" && (
        <div className={element.dividerSpacing === "lg" ? "py-4" : element.dividerSpacing === "sm" ? "py-1" : "py-2"}>
          <hr className="border-line" />
        </div>
      )}

      {element.type === "hidden" && (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-line bg-paper-soft px-3 py-2 text-xs text-ink-soft">
          <span className="font-mono font-medium">Hidden tracker: {element.fieldKey || "param"}</span>
          <span>Value: &quot;{element.fieldDefaultValue || ""}&quot;</span>
        </div>
      )}

      {isFieldElementType(element.type) && element.type !== "hidden" && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <input
              value={element.fieldLabel || ""}
              onChange={(e) => onUpdateProps({ fieldLabel: e.target.value })}
              placeholder="Field label"
              className="bg-transparent text-sm font-medium text-ink outline-none border-b border-transparent hover:border-line focus:border-ink px-0.5"
            />
            {element.fieldRequired && <span className="text-red-500 font-bold">*</span>}
          </div>

          {element.type === "textarea" ? (
            <textarea
              readOnly
              placeholder={element.fieldPlaceholder || "Type here..."}
              rows={3}
              style={inputStyle}
              className="w-full resize-none rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none cursor-default"
            />
          ) : element.type === "select" ? (
            <select
              disabled
              style={inputStyle}
              className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none cursor-default text-ink"
            >
              <option>{element.fieldPlaceholder || "Choose an option..."}</option>
              {(element.fieldOptions || "")
                .split(",")
                .filter(Boolean)
                .map((opt, i) => (
                  <option key={i}>{opt.trim()}</option>
                ))}
            </select>
          ) : element.type === "checkbox" ? (
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" disabled className="h-4 w-4 rounded border-line accent-ink" />
              <span className="text-sm text-ink-soft">{element.fieldLabel || "Checkbox option"}</span>
            </div>
          ) : (
            <input
              type="text"
              readOnly
              placeholder={element.fieldPlaceholder || "Enter text..."}
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
          <div
            style={buttonStyle}
            className={`${
              element.buttonAlign === "full" ? "w-full text-center" : ""
            } rounded-xl bg-ink px-6 py-2.5 text-sm font-medium text-paper shadow-sm`}
          >
            <input
              value={element.buttonLabel || ""}
              onChange={(e) => onUpdateProps({ buttonLabel: e.target.value })}
              placeholder="Submit"
              className="bg-transparent text-center font-medium outline-none border-b border-transparent hover:border-paper/40 focus:border-paper w-auto"
            />
          </div>
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

// ── Main ConsoleFormEditor Component ────────────────────────────────────────

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
  const [rightTab, setRightTab] = useState<"inspector" | "design">("design");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);

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

  // Keyboard shortcuts
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
    setRightTab("inspector");
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { kind?: string; elementType?: FormElementType } | undefined;
    if (data?.kind === "palette" && data.elementType) {
      setActiveDragLabel(`Add ${data.elementType.replace("_", " ")}`);
      return;
    }
    const dragged = elements.find((el) => el.id === event.active.id);
    setActiveDragLabel(dragged ? dragged.type.replace("_", " ") : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragLabel(null);
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
      setRightTab("inspector");
      return;
    }

    const oldIndex = elements.findIndex((el) => el.id === active.id);
    if (oldIndex < 0) return;
    const newIndex =
      over.id === "canvas-end" ? elements.length - 1 : elements.findIndex((el) => el.id === over.id);
    if (newIndex < 0 || oldIndex === newIndex) return;
    updateElements(arrayMove(elements, oldIndex, newIndex));
  }

  function updateElementProps(id: string, patch: Partial<FormCanvasElement>) {
    updateElements(
      elements.map((el) => (el.id === id ? ({ ...el, ...patch } as FormCanvasElement) : el)),
    );
  }

  function deleteElement(id: string) {
    if (initialForm.isFixed) return;
    updateElements(elements.filter((el) => el.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setRightTab("design");
    }
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
    setRightTab("inspector");
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
        <ConsoleModal title="Form Settings" onClose={() => setSettingsOpen(false)} wide>
          <div className="space-y-5">
            <label className="grid gap-1.5 text-sm font-medium">
              Form Name
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
              Direct Shareable Address
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
                Standalone direct link visitors can access without being on a website page.
              </span>
            </label>

            <div className="rounded-xl border border-line p-4 space-y-3">
              <h3 className="text-sm font-semibold text-ink">Two-Step Email Verification</h3>
              <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifyEmail}
                  onChange={(e) => {
                    setVerifyEmail(e.target.checked);
                    setDirty(true);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-line accent-ink"
                />
                <div>
                  <span className="font-medium text-ink">Require OTP verification passcode</span>
                  <p className="text-xs text-ink-soft">
                    Sends a 6-digit code to the email address before recording the submission and creating the contact.
                  </p>
                </div>
              </label>
            </div>

            <div className="rounded-xl border border-line p-4 space-y-4">
              <h3 className="text-sm font-semibold text-ink">Submission Outcome</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="submissionAction"
                    value="message"
                    checked={submissionAction === "message"}
                    onChange={() => {
                      setSubmissionAction("message");
                      setDirty(true);
                    }}
                    className="accent-ink"
                  />
                  <span>Show thank you confirmation message inline</span>
                </label>
                <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="submissionAction"
                    value="redirect"
                    checked={submissionAction === "redirect"}
                    onChange={() => {
                      setSubmissionAction("redirect");
                      setDirty(true);
                    }}
                    className="accent-ink"
                  />
                  <span>Redirect to thank you page or custom URL</span>
                </label>
              </div>

              {submissionAction === "redirect" ? (
                <label className="grid gap-1.5 text-sm font-medium pt-2">
                  Thank You Page Address / URL
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
                    Success Headline
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
                    Success Message
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
              Notify Email Address (Optional)
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
            className="truncate font-semibold text-sm text-ink bg-transparent border-b border-transparent hover:border-line focus:border-ink outline-none px-1.5 py-0.5 rounded"
            placeholder="Form name"
          />

          {initialForm.isFixed && (
            <span className="hidden sm:inline-block rounded-full bg-paper-soft px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
              Auth Fixed Form
            </span>
          )}

          {error && <span className="hidden md:inline text-xs text-red-600 truncate">{error}</span>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Working Desktop vs Mobile Viewport Switcher */}
          <div className="flex items-center gap-0.5 rounded-lg bg-paper-soft p-0.5">
            <button
              type="button"
              onClick={() => setDevice("desktop")}
              aria-label="Desktop view"
              title="Desktop view"
              className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                device === "desktop" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              <DesktopIcon />
            </button>
            <button
              type="button"
              onClick={() => setDevice("mobile")}
              aria-label="Mobile view"
              title="Mobile view"
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

      {/* Main Studio 3-Column Layout */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragLabel(null)}
      >
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {/* Left Sidebar: Palette of Drag-and-Drop Elements */}
          <aside className="w-[200px] shrink-0 border-r border-line bg-white flex flex-col overflow-y-auto p-3 space-y-4">
            {PALETTE_GROUPS.map(({ group, items }) => (
              <div key={group}>
                <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                  {group}
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {items.map((item) => (
                    <PaletteTile key={item.type} item={item} onPick={addElement} />
                  ))}
                </div>
              </div>
            ))}
          </aside>

          {/* Center Canvas with Realistic Desktop & Mobile Mockups */}
          <main
            onClick={() => {
              setSelectedId(null);
            }}
            className="relative min-w-0 flex-1 overflow-y-auto bg-paper-soft p-4 sm:p-8 flex items-start justify-center"
          >
            {device === "mobile" ? (
              /* Authentic Mobile Mockup Frame */
              <div className="w-[375px] shrink-0 overflow-hidden rounded-[3rem] border-[10px] border-ink shadow-2xl bg-white flex flex-col">
                {/* Speaker pill notch */}
                <div className="h-5 w-full bg-ink flex items-center justify-center pt-1 pb-2">
                  <div className="h-3 w-20 rounded-full bg-zinc-800" />
                </div>
                <div
                  style={{
                    backgroundColor: design.backgroundColor || "#ffffff",
                    fontFamily: design.fontFamily || undefined,
                  }}
                  className="min-h-[580px] p-4 overflow-y-auto"
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
                          setRightTab("inspector");
                        }}
                        onDelete={() => deleteElement(element.id)}
                        onDuplicate={() => duplicateElement(element.id)}
                        onMoveUp={() => moveElement(i, -1)}
                        onMoveDown={() => moveElement(i, 1)}
                        canMoveUp={i > 0}
                        canMoveDown={i < elements.length - 1}
                        onUpdateProps={(patch) => updateElementProps(element.id, patch)}
                        design={design}
                        isFixed={initialForm.isFixed}
                      />
                    ))}
                  </SortableContext>
                  <CanvasEndDropzone empty={elements.length === 0} />
                </div>
              </div>
            ) : (
              /* Realistic Desktop Browser Frame */
              <div className="w-full max-w-2xl rounded-2xl border border-line bg-white shadow-md overflow-hidden flex flex-col">
                {/* Browser top chrome */}
                <div className="flex h-10 items-center justify-between border-b border-line bg-paper px-4">
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-red-400" />
                    <span className="h-3 w-3 rounded-full bg-amber-400" />
                    <span className="h-3 w-3 rounded-full bg-green-400" />
                  </div>
                  <div className="mx-auto rounded-md border border-line bg-paper-soft px-8 py-1 text-[11px] font-mono text-ink-soft">
                    {slug ? `/f/${slug}` : "preview"}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: design.backgroundColor || "#ffffff",
                    fontFamily: design.fontFamily || undefined,
                  }}
                  className="min-h-[420px] p-6 sm:p-8"
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
                          setRightTab("inspector");
                        }}
                        onDelete={() => deleteElement(element.id)}
                        onDuplicate={() => duplicateElement(element.id)}
                        onMoveUp={() => moveElement(i, -1)}
                        onMoveDown={() => moveElement(i, 1)}
                        canMoveUp={i > 0}
                        canMoveDown={i < elements.length - 1}
                        onUpdateProps={(patch) => updateElementProps(element.id, patch)}
                        design={design}
                        isFixed={initialForm.isFixed}
                      />
                    ))}
                  </SortableContext>

                  <CanvasEndDropzone empty={elements.length === 0} />
                </div>
              </div>
            )}
          </main>

          {/* Right Sidebar: Dedicated Inspector & Design System */}
          <aside className="w-[320px] shrink-0 border-l border-line bg-white flex flex-col">
            <div className="flex border-b border-line bg-paper-soft/50">
              <button
                type="button"
                onClick={() => setRightTab("inspector")}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider text-center border-b-2 transition ${
                  rightTab === "inspector"
                    ? "border-ink text-ink bg-white"
                    : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                Inspector
              </button>
              <button
                type="button"
                onClick={() => {
                  setRightTab("design");
                }}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider text-center border-b-2 transition ${
                  rightTab === "design"
                    ? "border-ink text-ink bg-white"
                    : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                Form Design
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
              {rightTab === "inspector" && selectedElement ? (
                /* Selected Element Inspector */
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-2.5">
                    <div className="flex items-center gap-1.5">
                      <ElementIcon type={selectedElement.type} className="h-4 w-4 text-ink-soft" />
                      <span className="text-sm font-semibold capitalize text-ink">
                        {selectedElement.type.replace("_", " ")}
                      </span>
                    </div>
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
                        Headline Text
                        <input
                          value={selectedElement.headingText || ""}
                          onChange={(e) => updateElementProps(selectedElement.id, { headingText: e.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Heading Level
                        <select
                          value={selectedElement.headingLevel || "h2"}
                          onChange={(e) =>
                            updateElementProps(selectedElement.id, {
                              headingLevel: e.target.value as "h1" | "h2" | "h3" | "h4",
                            })
                          }
                          className={inputClass}
                        >
                          <option value="h1">H1 — Largest</option>
                          <option value="h2">H2 — Standard Title</option>
                          <option value="h3">H3 — Subtitle</option>
                          <option value="h4">H4 — Small Header</option>
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Text Alignment
                        <select
                          value={selectedElement.headingAlign || "left"}
                          onChange={(e) =>
                            updateElementProps(selectedElement.id, {
                              headingAlign: e.target.value as "left" | "center" | "right",
                            })
                          }
                          className={inputClass}
                        >
                          <option value="left">Left</option>
                          <option value="center">Centered</option>
                          <option value="right">Right</option>
                        </select>
                      </label>
                    </>
                  )}

                  {selectedElement.type === "text" && (
                    <>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Paragraph Content
                        <textarea
                          rows={4}
                          value={selectedElement.textContent || ""}
                          onChange={(e) => updateElementProps(selectedElement.id, { textContent: e.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedElement.textMuted === true}
                          onChange={(e) => updateElementProps(selectedElement.id, { textMuted: e.target.checked })}
                          className="h-4 w-4 rounded border-line accent-ink"
                        />
                        <span>Muted soft text tone</span>
                      </label>
                    </>
                  )}

                  {isFieldElementType(selectedElement.type) && (
                    <>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Field Label
                        <input
                          value={selectedElement.fieldLabel || ""}
                          onChange={(e) => updateElementProps(selectedElement.id, { fieldLabel: e.target.value })}
                          className={inputClass}
                        />
                      </label>

                      <label className="grid gap-1.5 text-xs font-medium">
                        Submission Key Name
                        <input
                          value={selectedElement.fieldKey || ""}
                          placeholder="field_key"
                          onChange={(e) =>
                            updateElementProps(selectedElement.id, {
                              fieldKey: e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9_]/g, "_")
                                .replace(/^_+|_+$/g, ""),
                            })
                          }
                          className={inputClass}
                        />
                        <span className="text-[10px] text-ink-soft">
                          Parameter key saved in submissions &amp; contacts.
                        </span>
                      </label>

                      {selectedElement.type !== "hidden" && selectedElement.type !== "checkbox" && (
                        <label className="grid gap-1.5 text-xs font-medium">
                          Placeholder Text
                          <input
                            value={selectedElement.fieldPlaceholder || ""}
                            onChange={(e) => updateElementProps(selectedElement.id, { fieldPlaceholder: e.target.value })}
                            className={inputClass}
                          />
                        </label>
                      )}

                      {/* Dropdown Options Manager */}
                      {selectedElement.type === "select" && (
                        <div className="space-y-2">
                          <label className="grid gap-1 text-xs font-medium">
                            Dropdown Choices
                            <textarea
                              rows={4}
                              value={selectedElement.fieldOptions || ""}
                              onChange={(e) => updateElementProps(selectedElement.id, { fieldOptions: e.target.value })}
                              placeholder="Option 1, Option 2, Option 3"
                              className={inputClass}
                            />
                            <span className="text-[10px] text-ink-soft">Separate choices with commas.</span>
                          </label>
                        </div>
                      )}

                      {selectedElement.type === "hidden" ? (
                        <label className="grid gap-1.5 text-xs font-medium">
                          Tracking Default Value
                          <input
                            value={selectedElement.fieldDefaultValue || ""}
                            placeholder="e.g. google, facebook, newsletter"
                            onChange={(e) => updateElementProps(selectedElement.id, { fieldDefaultValue: e.target.value })}
                            className={inputClass}
                          />
                        </label>
                      ) : (
                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={selectedElement.fieldRequired === true}
                            onChange={(e) => updateElementProps(selectedElement.id, { fieldRequired: e.target.checked })}
                            className="h-4 w-4 rounded border-line accent-ink"
                          />
                          <span>Required field</span>
                        </label>
                      )}
                    </>
                  )}

                  {selectedElement.type === "button" && (
                    <>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Button Label
                        <input
                          value={selectedElement.buttonLabel || ""}
                          onChange={(e) => updateElementProps(selectedElement.id, { buttonLabel: e.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Button Width &amp; Alignment
                        <select
                          value={selectedElement.buttonAlign || "full"}
                          onChange={(e) =>
                            updateElementProps(selectedElement.id, {
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
                          updateElementProps(selectedElement.id, {
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
                        className="w-full rounded-xl border border-red-200 bg-red-50 py-2 text-xs font-medium text-red-600 hover:border-red-600 transition"
                      >
                        Delete element
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Form Design System Tab */
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Form Design System</h3>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      Style tokens applied independently from page and site themes.
                    </p>
                  </div>

                  <label className="grid gap-1.5 text-xs font-medium">
                    Submit Button Color
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={design.buttonColor || "#0a0a0a"}
                        onChange={(e) => {
                          setDesign({ ...design, buttonColor: e.target.value });
                          setDirty(true);
                        }}
                        className="h-8 w-8 cursor-pointer rounded border border-line"
                      />
                      <input
                        value={design.buttonColor}
                        placeholder="#0a0a0a"
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
                        value={design.borderColor || "#e2e2e0"}
                        onChange={(e) => {
                          setDesign({ ...design, borderColor: e.target.value });
                          setDirty(true);
                        }}
                        className="h-8 w-8 cursor-pointer rounded border border-line"
                      />
                      <input
                        value={design.borderColor}
                        placeholder="#e2e2e0"
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
                      <option value="">Theme default (rounded)</option>
                      <option value="0px">Sharp (0px)</option>
                      <option value="6px">Subtle (6px)</option>
                      <option value="12px">Rounded (12px)</option>
                      <option value="16px">Curved (16px)</option>
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
              )}
            </div>
          </aside>
        </div>

        <DragOverlay>
          {activeDragLabel && (
            <div className="rounded-xl border border-ink bg-paper px-4 py-2 text-sm font-medium text-ink shadow-2xl">
              {activeDragLabel}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
