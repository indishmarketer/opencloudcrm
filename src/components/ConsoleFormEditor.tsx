"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ConsoleModal from "@/components/ConsoleModal";
import InkSelect from "@/components/InkSelect";
import {
  FORM_CONTACT_MAPPINGS,
  isFieldElementType,
  resolveContactMapping,
  type FormCanvasElement,
  type FormContactMapping,
  type FormDefinition,
  type FormDesign,
  type FormElementStyle,
  type FormElementType,
  type FormSubmissionAction,
} from "@/lib/formsShape";
import {
  elementButtonStyle,
  elementInputStyle,
  elementTextStyle,
  elementWrapperStyle,
  hasCustomWidth,
} from "@/lib/formElementStyles";

// Deterministic ID generator that avoids Math.random() in render
let elementCounter = 0;
function nextElementId(): string {
  elementCounter += 1;
  return `elem_${Date.now().toString(36)}_${elementCounter}`;
}

function parseChoices(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
  } catch {}
  if (raw.includes("\n")) {
    return raw.split("\n").map((s) => s.trim()).filter(Boolean);
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
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
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const CopyIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const CheckIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const EyeOffIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-ink-soft shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);
const StyleIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="10.5" r="2.5" />
    <circle cx="8.5" cy="7.5" r="2.5" />
    <circle cx="6.5" cy="12.5" r="2.5" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.7 1.5-1.5 0-.4-.1-.7-.4-1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-5.5-4.5-10-10-10z" />
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
    case "radio":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" />
        </svg>
      );
    case "multiselect":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="7" height="7" rx="1.5" /><polyline points="4.5 7.5 6 9 8.5 6" />
          <rect x="3" y="13" width="7" height="7" rx="1.5" /><polyline points="4.5 16.5 6 18 8.5 15" />
          <line x1="13" y1="7.5" x2="21" y2="7.5" /><line x1="13" y1="16.5" x2="21" y2="16.5" />
        </svg>
      );
    case "checkbox":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "country":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "address":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
        </svg>
      );
    case "number":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
        </svg>
      );
    case "button":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="6" width="18" height="12" rx="3" /><line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      );
    case "divider":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      );
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="6" width="18" height="12" rx="2" /><path d="M8 12h8" />
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
      { type: "radio", label: "Single select" },
      { type: "multiselect", label: "Multi select" },
      { type: "checkbox", label: "Checkbox" },
      { type: "country", label: "Country" },
      { type: "address", label: "Address" },
      { type: "number", label: "Number" },
    ],
  },
  {
    group: "Action",
    items: [{ type: "button", label: "Button" }],
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
      return { id, type, fieldLabel: "Text field", fieldKey: "text_field", fieldPlaceholder: "Enter text…", fieldRequired: false };
    case "email":
      return { id, type, fieldLabel: "Email address", fieldKey: "email", fieldPlaceholder: "you@example.com", fieldRequired: true };
    case "phone":
      return { id, type, fieldLabel: "Phone number", fieldKey: "phone", fieldPlaceholder: "98765 43210", fieldRequired: false };
    case "textarea":
      return { id, type, fieldLabel: "Message", fieldKey: "message", fieldPlaceholder: "Type your message…", fieldRequired: false };
    case "select":
      return {
        id,
        type,
        fieldLabel: "Select option",
        fieldKey: "choice",
        fieldOptions: JSON.stringify(["Option 1", "Option 2", "Option 3"]),
        fieldRequired: false,
      };
    case "radio":
      return {
        id,
        type,
        fieldLabel: "Single select option",
        fieldKey: "single_choice",
        fieldOptions: JSON.stringify(["Option 1", "Option 2", "Option 3"]),
        fieldRequired: false,
      };
    case "multiselect":
      return {
        id,
        type,
        fieldLabel: "Multi select options",
        fieldKey: "multi_choices",
        fieldOptions: JSON.stringify(["Choice 1", "Choice 2", "Choice 3"]),
        fieldRequired: false,
      };
    case "checkbox":
      return { id, type, fieldLabel: "I agree to the terms and privacy policy", fieldKey: "consent", fieldRequired: true };
    case "country":
      return { id, type, fieldLabel: "Country", fieldKey: "country", fieldRequired: false };
    case "address":
      return { id, type, fieldLabel: "Street Address", fieldKey: "address", fieldPlaceholder: "123 Main St, Suite 100", fieldRequired: false };
    case "number":
      return { id, type, fieldLabel: "Quantity / Amount", fieldKey: "quantity", fieldRequired: false };
    case "button":
      return { id, type, buttonLabel: "Submit", buttonAlign: "full", buttonVariant: "primary" };
    case "divider":
      return { id, type, dividerSpacing: "md" };
    default:
      return { id, type: "text_input", fieldLabel: "Text field", fieldKey: "field", fieldRequired: false };
  }
}

// ── Corner Radius Picker with Custom Input (Image 2 Fix) ────────────────────

/** Shows on the canvas next to any field whose answer is copied onto the
 * contact record, so the owner can see at a glance which answers become CRM
 * data and which stay in the submission. */
function contactMappingBadge(element: FormCanvasElement) {
  if (!isFieldElementType(element.type)) return null;
  const mapping = resolveContactMapping({
    type: (element.type === "text_input" || element.type === "hidden" ? "text" : element.type) as never,
    key: element.fieldKey,
    label: element.fieldLabel,
    contactMapping: element.contactMapping,
  });
  if (mapping === "none") return null;
  const label = mapping === "detail" ? "→ contact detail" : `→ contact ${mapping}`;
  return (
    <span
      title="This answer is saved onto the contact record"
      className="shrink-0 rounded-full bg-paper-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-soft"
    >
      {label}
    </span>
  );
}

// ── Size stepper ──────────────────────────────────────────────────────────

/** A length with arrows. Every element's Layout block is built from these,
 * which is what gives a button (and now every other element) a real custom
 * size instead of only an alignment choice: hold an arrow, watch the canvas
 * resize live. The unit is kept as typed, so "50%" and "3rem" survive a
 * round-trip; bare numbers are read as px by cssLength on save. */
function SizeStepper({
  value,
  onChange,
  placeholder,
  min = 0,
  max = 2000,
  step = 1,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const match = /^(-?[0-9]*\.?[0-9]+)(px|rem|em|%|vw|vh|ch)?$/.exec(value.trim());
  const amount = match ? Number(match[1]) : null;
  const unit = match?.[2] || "px";

  const nudge = (delta: number) => {
    const base = amount ?? 0;
    const next = Math.min(max, Math.max(min, Math.round((base + delta) * 100) / 100));
    onChange(`${next}${unit}`);
  };

  return (
    <div className="flex items-stretch gap-1">
      <input
        value={value}
        placeholder={placeholder || "auto"}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink outline-none transition-colors focus:border-ink"
      />
      <div className="flex shrink-0 flex-col overflow-hidden rounded-lg border border-line">
        <button
          type="button"
          aria-label="Increase"
          onClick={() => nudge(step)}
          className="flex h-[15px] w-6 items-center justify-center text-[8px] leading-none text-ink-soft transition-colors hover:bg-paper-soft hover:text-ink"
        >
          ▲
        </button>
        <button
          type="button"
          aria-label="Decrease"
          onClick={() => nudge(-step)}
          className="flex h-[15px] w-6 items-center justify-center border-t border-line text-[8px] leading-none text-ink-soft transition-colors hover:bg-paper-soft hover:text-ink"
        >
          ▼
        </button>
      </div>
      {value && (
        <button
          type="button"
          aria-label="Clear"
          title="Back to default"
          onClick={() => onChange("")}
          className="shrink-0 rounded-lg border border-line px-1.5 text-[10px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          ✕
        </button>
      )}
    </div>
  );
}

const FONT_WEIGHT_OPTIONS = [
  { value: "", label: "Theme default" },
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extrabold" },
];

/** The Layout & Size block, identical for every element type. Before this,
 * only a button had any layout control at all (and only its alignment), so a
 * heading, an input or a divider could not be padded, resized or spaced. */
function ElementLayoutPanel({
  style,
  onChange,
  showHeight,
}: {
  style: FormElementStyle | undefined;
  onChange: (patch: Partial<FormElementStyle>) => void;
  showHeight: boolean;
}) {
  const get = (key: keyof FormElementStyle) => String(style?.[key] ?? "");
  const row = (label: string, key: keyof FormElementStyle, hint?: string, max?: number) => (
    <label className="grid gap-1 text-xs font-medium">
      <span className="flex items-baseline justify-between gap-2">
        {label}
        {hint && <span className="text-[10px] font-normal text-ink-soft">{hint}</span>}
      </span>
      <SizeStepper value={get(key)} onChange={(val) => onChange({ [key]: val })} max={max} />
    </label>
  );

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink">Layout &amp; Size</h4>
        <p className="mt-0.5 text-[10px] text-ink-soft">
          Blank means inherit. Type a bare number for pixels, or add %, rem or em.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {row("Width", "width", "px / %")}
        {showHeight ? row("Height", "height", "px") : <div />}
        {row("Padding ↔", "paddingX", "px", 200)}
        {row("Padding ↕", "paddingY", "px", 200)}
        {row("Space above", "marginTop", "px", 400)}
        {row("Space below", "marginBottom", "px", 400)}
        {row("Font size", "fontSize", "px", 200)}
        {row("Border width", "borderWidth", "px", 40)}
      </div>
      <div className="grid gap-1 text-xs font-medium">
        <span>Font weight</span>
        <InkSelect
          value={get("fontWeight")}
          onChange={(val) => onChange({ fontWeight: val })}
          options={FONT_WEIGHT_OPTIONS}
        />
      </div>
      <div className="grid gap-1 text-xs font-medium">
        <span>Alignment</span>
        <div className="grid grid-cols-4 gap-1">
          {([
            { value: "", label: "Auto" },
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ] as const).map((option) => (
            <button
              key={option.value || "auto"}
              type="button"
              onClick={() => onChange({ textAlign: (option.value || undefined) as FormElementStyle["textAlign"] })}
              className={`rounded-lg border py-1.5 text-[11px] font-medium transition-colors ${
                (style?.textAlign || "") === option.value
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-ink hover:border-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CornerRadiusPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const PRESETS = [
    { value: "", label: "Theme default (rounded)" },
    { value: "0px", label: "Sharp (0px)" },
    { value: "4px", label: "Subtle (4px)" },
    { value: "8px", label: "Rounded (8px)" },
    { value: "12px", label: "Curved (12px)" },
    { value: "16px", label: "Large (16px)" },
    { value: "9999px", label: "Pill (9999px)" },
    { value: "__custom__", label: "Custom px…" },
  ];

  const isPreset = PRESETS.some((p) => p.value !== "__custom__" && p.value === value);
  const activeValue = isPreset ? value : "__custom__";
  const [customPx, setCustomPx] = useState(value ? value.replace(/[^0-9]/g, "") || "8" : "8");

  return (
    <div className="space-y-1.5">
      <InkSelect
        value={activeValue}
        onChange={(val) => {
          if (val === "__custom__") {
            onChange(`${customPx || 8}px`);
          } else {
            onChange(val);
          }
        }}
        options={PRESETS}
      />
      {activeValue === "__custom__" && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="number"
            min="0"
            max="100"
            value={customPx}
            onChange={(e) => {
              const num = e.target.value;
              setCustomPx(num);
              onChange(`${num || 0}px`);
            }}
            placeholder="8"
            className="w-24 rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink outline-none focus:border-ink"
          />
          <span className="text-xs text-ink-soft">pixels (px)</span>
        </div>
      )}
    </div>
  );
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

  // Built by the same helpers the live form uses, so the canvas is a true
  // preview rather than a separate approximation of it.
  const inputStyle = elementInputStyle(design, element.elementStyle);
  const buttonStyle = {
    backgroundColor: design.buttonColor || "#0a0a0a",
    color: design.buttonTextColor || "#ffffff",
    ...elementButtonStyle(design, element.elementStyle),
  };
  const textStyle = elementTextStyle(design, element.elementStyle);
  const wrapperStyle = elementWrapperStyle(element.elementStyle);

  const choices = parseChoices(element.fieldOptions);

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
          ? "border-ink bg-white"
          : "border-transparent bg-white hover:border-line"
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
        <div style={{ textAlign: element.elementStyle?.textAlign || element.headingAlign || "left", ...wrapperStyle }}>
          <input
            value={element.headingText || ""}
            onChange={(e) => onUpdateProps({ headingText: e.target.value })}
            placeholder="Headline"
            style={textStyle}
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
        <div style={{ textAlign: element.elementStyle?.textAlign || element.textAlign || "left", ...wrapperStyle }}>
          <textarea
            rows={2}
            value={element.textContent || ""}
            onChange={(e) => onUpdateProps({ textContent: e.target.value })}
            placeholder="Paragraph text"
            style={textStyle}
            className={`w-full resize-none bg-transparent outline-none text-sm border-b border-transparent hover:border-line focus:border-ink ${
              element.textMuted ? "text-ink-soft" : "text-ink"
            }`}
          />
        </div>
      )}

      {element.type === "divider" && (
        <div
          style={wrapperStyle}
          className={element.dividerSpacing === "lg" ? "py-4" : element.dividerSpacing === "sm" ? "py-1" : "py-2"}
        >
          <hr
            className="border-line"
            style={{
              borderColor: element.elementStyle?.borderColor || design.borderColor || undefined,
              borderTopWidth: element.elementStyle?.borderWidth || undefined,
              width: element.elementStyle?.width || undefined,
            }}
          />
        </div>
      )}

      {/* Hidden field indicator on admin canvas */}
      {(element.type === "hidden" || element.fieldHidden) && (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-line bg-paper-soft px-3.5 py-2.5 text-xs text-ink">
          <div className="flex items-center gap-2 font-medium">
            <EyeOffIcon />
            <span>Hidden Field: {element.fieldLabel || element.fieldKey || "tracker"}</span>
          </div>
          <span className="text-ink-soft font-mono text-[11px]">
            Param / Default: &quot;{element.fieldDefaultValue || "auto"}&quot;
          </span>
        </div>
      )}

      {/* Visible field elements */}
      {isFieldElementType(element.type) && !element.fieldHidden && element.type !== "hidden" && (
        <div className="space-y-1.5" style={wrapperStyle}>
          <div className="flex items-center gap-1">
            <input
              value={element.fieldLabel || ""}
              onChange={(e) => onUpdateProps({ fieldLabel: e.target.value })}
              placeholder="Field label"
              style={{
                color: element.elementStyle?.textColor || undefined,
                fontSize: element.elementStyle?.fontSize || undefined,
                fontWeight: element.elementStyle?.fontWeight || undefined,
              }}
              className="bg-transparent text-sm font-medium text-ink outline-none border-b border-transparent hover:border-line focus:border-ink px-0.5"
            />
            {contactMappingBadge(element)}
          </div>

          {element.type === "textarea" ? (
            <textarea
              readOnly
              placeholder={element.fieldPlaceholder || "Type here…"}
              rows={3}
              style={inputStyle}
              className="w-full resize-none rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none cursor-default"
            />
          ) : element.type === "phone" ? (
            <div className="flex gap-2">
              <div
                style={inputStyle}
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-paper px-3 text-sm text-ink cursor-default"
              >
                <span>🇮🇳</span>
                <span className="font-mono text-xs font-medium text-ink">+91</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              <input
                type="text"
                readOnly
                placeholder={element.fieldPlaceholder || "98765 43210"}
                style={inputStyle}
                className="flex-1 rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none cursor-default"
              />
            </div>
          ) : element.type === "country" ? (
            <div
              style={inputStyle}
              className="flex w-full items-center justify-between rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm text-ink cursor-default"
            >
              <span className="flex items-center gap-2">
                <span>🌐</span>
                <span className="text-ink-soft">Select country…</span>
              </span>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          ) : element.type === "select" ? (
            <div
              style={inputStyle}
              className="flex w-full items-center justify-between rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm text-ink cursor-default"
            >
              <span className="text-ink-soft">{element.fieldPlaceholder || "Choose an option…"}</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          ) : element.type === "radio" ? (
            <div className="space-y-1.5 pt-1">
              {choices.map((choice, i) => (
                <div
                  key={i}
                  style={inputStyle}
                  className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink cursor-default"
                >
                  <input type="radio" disabled checked={i === 0} className="accent-ink" />
                  <span>{choice}</span>
                </div>
              ))}
            </div>
          ) : element.type === "multiselect" ? (
            <div className="space-y-1.5 pt-1">
              {choices.map((choice, i) => (
                <div
                  key={i}
                  style={inputStyle}
                  className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink cursor-default"
                >
                  <input type="checkbox" disabled checked={i === 0} className="h-3.5 w-3.5 rounded border-line accent-ink" />
                  <span>{choice}</span>
                </div>
              ))}
            </div>
          ) : element.type === "checkbox" ? (
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" disabled className="h-4 w-4 rounded border-line accent-ink" />
              <span className="text-sm text-ink-soft">{element.fieldLabel || "Checkbox agreement"}</span>
            </div>
          ) : (
            <input
              type="text"
              readOnly
              placeholder={element.fieldPlaceholder || "Enter text…"}
              style={inputStyle}
              className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none cursor-default"
            />
          )}
        </div>
      )}

      {element.type === "button" && (
        <div
          style={wrapperStyle}
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
              element.buttonAlign === "full" && !hasCustomWidth(element.elementStyle) ? "w-full text-center" : ""
            } ${element.elementStyle?.paddingX || element.elementStyle?.padding ? "" : "px-6"} ${
              element.elementStyle?.paddingY || element.elementStyle?.padding || element.elementStyle?.height
                ? "flex items-center justify-center"
                : "py-2.5"
            } rounded-xl bg-ink text-sm font-medium text-paper shadow-sm`}
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
      className={`transition-colors rounded-xl border border-dashed ${
        isOver ? "border-ink bg-paper-soft text-ink" : "border-line text-ink-soft"
      } ${empty ? "p-16 text-center text-sm" : "py-6 flex items-center justify-center text-xs"}`}
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

  // Core Form State
  const [formName, setFormName] = useState(initialForm.name);
  const [slug, setSlug] = useState(initialForm.slug);
  const [elements, setElements] = useState<FormCanvasElement[]>(initialForm.elements);
  const [design, setDesign] = useState<FormDesign>(initialForm.design);
  const [submissionAction, setSubmissionAction] = useState<FormSubmissionAction>(initialForm.submissionAction);
  const [redirectUrl, setRedirectUrl] = useState(initialForm.redirectUrl);
  const [successHeading, setSuccessHeading] = useState(initialForm.successHeading);
  const [successText, setSuccessText] = useState(initialForm.successText);
  const [notifyEmail, setNotifyEmail] = useState(initialForm.notifyEmail);
  const [source, setSource] = useState(initialForm.source);
  const [verifyEmail, setVerifyEmail] = useState(initialForm.verifyEmail);

  // Editor Interaction State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"inspector" | "style">("inspector");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);

  // Undo / Redo History
  const [history, setHistory] = useState<{
    past: FormCanvasElement[][];
    future: FormCanvasElement[][];
  }>({ past: [], future: [] });

  const pushHistory = useCallback(
    (newElements: FormCanvasElement[]) => {
      setHistory((curr) => ({
        past: [...curr.past.slice(-20), elements],
        future: [],
      }));
      setElements(newElements);
      setDirty(true);
    },
    [elements],
  );

  const undo = useCallback(() => {
    if (history.past.length === 0) return;
    const prev = history.past[history.past.length - 1];
    setHistory((curr) => ({
      past: curr.past.slice(0, -1),
      future: [elements, ...curr.future],
    }));
    setElements(prev);
    setDirty(true);
  }, [elements, history.past]);

  const redo = useCallback(() => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    setHistory((curr) => ({
      past: [...curr.past, elements],
      future: curr.future.slice(1),
    }));
    setElements(next);
    setDirty(true);
  }, [elements, history.future]);

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  // Keyboard shortcut listener (Ctrl+Z / Ctrl+Shift+Z / Ctrl+S)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && ((e.key === "z" && e.shiftKey) || e.key === "y")) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  function handleDragStart(event: { active: { id: string | number; data?: { current?: Record<string, unknown> } } }) {
    const data = event.active.data?.current;
    if (data?.kind === "palette") {
      const type = data.elementType as FormElementType;
      const paletteItem = PALETTE_GROUPS.flatMap((g) => g.items).find((i) => i.type === type);
      setActiveDragLabel(paletteItem ? `Add ${paletteItem.label}` : "Add Element");
    } else {
      const el = elements.find((e) => e.id === String(event.active.id));
      setActiveDragLabel(el ? el.fieldLabel || el.buttonLabel || el.headingText || "Element" : "Element");
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragLabel(null);
    if (!over) return;

    const data = active.data?.current;
    // Dropping from palette onto canvas
    if (data?.kind === "palette") {
      const newEl = createElement(data.elementType as FormElementType);
      if (over.id === "canvas-end") {
        pushHistory([...elements, newEl]);
      } else {
        const overIndex = elements.findIndex((el) => el.id === over.id);
        if (overIndex >= 0) {
          const next = [...elements];
          next.splice(overIndex, 0, newEl);
          pushHistory(next);
        } else {
          pushHistory([...elements, newEl]);
        }
      }
      setSelectedId(newEl.id);
      setRightTab("inspector");
      return;
    }

    // Canvas internal reordering
    if (active.id !== over.id) {
      const oldIndex = elements.findIndex((el) => el.id === active.id);
      const newIndex = elements.findIndex((el) => el.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        pushHistory(arrayMove(elements, oldIndex, newIndex));
      }
    }
  }

  function addElement(type: FormElementType) {
    const newEl = createElement(type);
    pushHistory([...elements, newEl]);
    setSelectedId(newEl.id);
    setRightTab("inspector");
  }

  function updateElements(next: FormCanvasElement[]) {
    pushHistory(next);
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
      source,
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
  /** The contact mapping actually in force for the selected field: its
   * explicit choice, or the type-derived default for a field saved before
   * this setting existed. */
  const effectiveMapping: FormContactMapping =
    selectedElement && isFieldElementType(selectedElement.type)
      ? resolveContactMapping({
          type: (selectedElement.type === "text_input" || selectedElement.type === "hidden"
            ? "text"
            : selectedElement.type) as never,
          key: selectedElement.fieldKey,
          label: selectedElement.fieldLabel,
          contactMapping: selectedElement.contactMapping,
        })
      : "none";
  const isFormStyleSelected = selectedId === "__form_style__";
  const isSidebarVisible = Boolean(selectedElement || isFormStyleSelected);

  const inputClass =
    "w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink outline-none transition-colors focus:border-ink";
  const button =
    "inline-flex items-center justify-center rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-paper-soft";
  const primaryButton =
    "inline-flex items-center justify-center rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50";
  const iconButton =
    "flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-paper-soft hover:text-ink";

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white text-ink">
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
              Contact source
              <input value={source} maxLength={100} placeholder="Newsletter" onChange={(e) => { setSource(e.target.value); setDirty(true); }} className={inputClass} />
              <span className="text-xs text-ink-soft">Shown on every contact who submits this form. Use the same label across pages to group sources.</span>
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

          {/* Form Style Trigger */}
          <button
            type="button"
            onClick={() => {
              setSelectedId("__form_style__");
              setRightTab("style");
            }}
            aria-label="Form Style"
            title="Form Style & Theme"
            className={`${iconButton} ${isFormStyleSelected ? "bg-paper-soft text-ink" : ""}`}
          >
            <StyleIcon />
          </button>

          <a href={`/console/forms/${initialForm.id}/submissions`} className={`${button} hidden sm:inline-flex`}>
            Responses
          </a>

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

      {/* Main Studio Layout */}
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

          {/* Center Canvas */}
          {device === "desktop" ? (
            <main
              onClick={() => {
                if (selectedId) setSelectedId(null);
              }}
              style={{
                backgroundColor: design.backgroundColor || "#ffffff",
                fontFamily: design.fontFamily || undefined,
              }}
              className="relative min-w-0 flex-1 h-full overflow-y-auto bg-white px-6 py-6 sm:px-12 sm:py-8 transition-colors"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full space-y-3"
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
            </main>
          ) : (
            /* Mobile Preview */
            <main
              onClick={() => {
                if (selectedId) setSelectedId(null);
              }}
              className="relative min-w-0 flex-1 h-full overflow-hidden bg-paper-soft flex justify-center items-stretch transition-colors"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: design.backgroundColor || "#ffffff",
                  fontFamily: design.fontFamily || undefined,
                }}
                className="w-full max-w-[400px] h-full shrink-0 border-x border-line flex flex-col overflow-hidden bg-white"
              >
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 space-y-3">
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
            </main>
          )}

          {/* Right Sidebar: Contextual Inspector & Style Panel */}
          {isSidebarVisible && (
            <aside className="w-[360px] shrink-0 border-l border-line bg-white flex flex-col animate-in slide-in-from-right-4 duration-150">
              {/* Header */}
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink">
                  {isFormStyleSelected
                    ? "Form Style"
                    : selectedElement
                      ? `${selectedElement.type.replace("_", " ")} Element`
                      : "Settings"}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="rounded p-1 text-ink-soft hover:bg-paper-soft hover:text-ink"
                  title="Close sidebar"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Tabs for element editing */}
              {selectedElement && (
                <div className="flex border-b border-line bg-paper-soft/40">
                  <button
                    type="button"
                    onClick={() => setRightTab("inspector")}
                    className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider text-center border-b-2 transition ${
                      rightTab === "inspector"
                        ? "border-ink text-ink bg-white"
                        : "border-transparent text-ink-soft hover:text-ink"
                    }`}
                  >
                    Properties
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab("style")}
                    className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider text-center border-b-2 transition ${
                      rightTab === "style"
                        ? "border-ink text-ink bg-white"
                        : "border-transparent text-ink-soft hover:text-ink"
                    }`}
                  >
                    Style
                  </button>
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
                {/* 1. Global Form Style */}
                {isFormStyleSelected && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">Form Style &amp; Theme</h3>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Applied across all elements and form container.
                      </p>
                    </div>

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

                    <div className="grid gap-1.5 text-xs font-medium">
                      <span>Corner Radius</span>
                      <CornerRadiusPicker
                        value={design.borderRadius || ""}
                        onChange={(val) => {
                          setDesign({ ...design, borderRadius: val });
                          setDirty(true);
                        }}
                      />
                    </div>

                    <div className="grid gap-1.5 text-xs font-medium">
                      <span>Font Family</span>
                      <InkSelect
                        value={design.fontFamily || ""}
                        onChange={(val) => {
                          setDesign({ ...design, fontFamily: val });
                          setDirty(true);
                        }}
                        options={[
                          { value: "", label: "Theme default" },
                          { value: "system-ui, sans-serif", label: "Modern Sans-Serif" },
                          { value: "Georgia, serif", label: "Editorial Serif" },
                          { value: "monospace", label: "Monospace" },
                        ]}
                      />
                    </div>
                  </div>
                )}

                {/* 2. Selected Element Properties Tab */}
                {selectedElement && rightTab === "inspector" && (
                  <div className="space-y-4">
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
                        <div className="grid gap-1.5 text-xs font-medium">
                          <span>Heading Level</span>
                          <InkSelect
                            value={selectedElement.headingLevel || "h2"}
                            onChange={(val) => updateElementProps(selectedElement.id, { headingLevel: val as "h1" | "h2" | "h3" | "h4" })}
                            options={[
                              { value: "h1", label: "H1 — Largest Title" },
                              { value: "h2", label: "H2 — Section Heading" },
                              { value: "h3", label: "H3 — Subsection" },
                              { value: "h4", label: "H4 — Small Header" },
                            ]}
                          />
                        </div>
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
                          <span>Muted secondary text color</span>
                        </label>
                      </>
                    )}

                    {/* Field Properties */}
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
                            Saved in contact records and submission entries.
                          </span>
                        </label>

                        {selectedElement.type !== "checkbox" && selectedElement.type !== "country" && (
                          <label className="grid gap-1.5 text-xs font-medium">
                            Placeholder Text
                            <input
                              value={selectedElement.fieldPlaceholder || ""}
                              onChange={(e) => updateElementProps(selectedElement.id, { fieldPlaceholder: e.target.value })}
                              className={inputClass}
                            />
                          </label>
                        )}

                        {/* Choices Manager for Dropdown, Radio, Multiselect */}
                        {["select", "radio", "multiselect"].includes(selectedElement.type) && (
                          <div className="space-y-2 pt-2 border-t border-line">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-ink">Choices / Options</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const current = parseChoices(selectedElement.fieldOptions);
                                  const next = [...current, `Option ${current.length + 1}`];
                                  updateElementProps(selectedElement.id, { fieldOptions: JSON.stringify(next) });
                                }}
                                className="text-xs font-medium text-ink hover:underline"
                              >
                                + Add choice
                              </button>
                            </div>
                            <div className="space-y-1.5">
                              {parseChoices(selectedElement.fieldOptions).map((choice, i, arr) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <input
                                    value={choice}
                                    onChange={(e) => {
                                      const next = [...arr];
                                      next[i] = e.target.value;
                                      updateElementProps(selectedElement.id, { fieldOptions: JSON.stringify(next) });
                                    }}
                                    placeholder={`Choice ${i + 1}`}
                                    className={inputClass}
                                  />
                                  <button
                                    type="button"
                                    disabled={arr.length <= 1}
                                    onClick={() => {
                                      const next = arr.filter((_, idx) => idx !== i);
                                      updateElementProps(selectedElement.id, { fieldOptions: JSON.stringify(next) });
                                    }}
                                    title="Remove choice"
                                    className="p-2 text-ink-soft hover:text-red-600 disabled:opacity-30 rounded"
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Required toggle */}
                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={selectedElement.fieldRequired === true}
                            onChange={(e) => updateElementProps(selectedElement.id, { fieldRequired: e.target.checked })}
                            className="h-4 w-4 rounded border-line accent-ink"
                          />
                          <span>Required field</span>
                        </label>

                        {/* Hidden field toggle */}
                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={selectedElement.fieldHidden === true}
                            onChange={(e) => updateElementProps(selectedElement.id, { fieldHidden: e.target.checked })}
                            className="h-4 w-4 rounded border-line accent-ink"
                          />
                          <span>Hidden field (not visible to visitors)</span>
                        </label>

                        {selectedElement.fieldHidden && (
                          <label className="grid gap-1.5 text-xs font-medium pt-1">
                            Tracking Default / UTM Parameter Value
                            <input
                              value={selectedElement.fieldDefaultValue || ""}
                              placeholder="e.g. utm_source or organic"
                              onChange={(e) => updateElementProps(selectedElement.id, { fieldDefaultValue: e.target.value })}
                              className={inputClass}
                            />
                            <span className="text-[10px] text-ink-soft">
                              Silently submitted with form to capture context without asking visitors.
                            </span>
                          </label>
                        )}

                        {/* Add to contact. Every submission is recorded in
                            full either way -- this decides which answers
                            also become data on the contact record itself. */}
                        <div className="space-y-2 pt-3 border-t border-line">
                          <div>
                            <span className="text-xs font-semibold text-ink">Add to contact</span>
                            <p className="mt-0.5 text-[10px] text-ink-soft">
                              Where this answer lands on the contact record. Leave it off for answers you
                              only want to read in the responses list.
                            </p>
                          </div>
                          <InkSelect
                            value={effectiveMapping}
                            onChange={(val) =>
                              updateElementProps(selectedElement.id, { contactMapping: val as FormContactMapping })
                            }
                            options={FORM_CONTACT_MAPPINGS}
                          />
                          {effectiveMapping === "detail" && (
                            <label className="grid gap-1.5 text-xs font-medium">
                              Detail name on the contact
                              <input
                                value={selectedElement.contactDetailLabel || ""}
                                placeholder={selectedElement.fieldLabel || "Detail"}
                                onChange={(e) =>
                                  updateElementProps(selectedElement.id, { contactDetailLabel: e.target.value })
                                }
                                className={inputClass}
                              />
                              <span className="text-[10px] text-ink-soft">
                                Shown under Details from forms on the contact, and deletable from there.
                                Re-submitting updates it rather than adding a second copy.
                              </span>
                            </label>
                          )}
                        </div>
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
                        <div className="grid gap-1.5 text-xs font-medium">
                          <span>Alignment</span>
                          <InkSelect
                            value={selectedElement.buttonAlign || "full"}
                            onChange={(val) =>
                              updateElementProps(selectedElement.id, {
                                buttonAlign: val as "full" | "left" | "center" | "right",
                              })
                            }
                            options={[
                              { value: "full", label: "Full width" },
                              { value: "left", label: "Left aligned" },
                              { value: "center", label: "Centered" },
                              { value: "right", label: "Right aligned" },
                            ]}
                          />
                          <span className="text-[10px] text-ink-soft">
                            Set an exact Width or Height in Layout below to size the button yourself instead.
                          </span>
                        </div>
                      </>
                    )}

                    {selectedElement.type === "divider" && (
                      <div className="grid gap-1.5 text-xs font-medium">
                        <span>Divider Spacing</span>
                        <InkSelect
                          value={selectedElement.dividerSpacing || "md"}
                          onChange={(val) =>
                            updateElementProps(selectedElement.id, {
                              dividerSpacing: val as "sm" | "md" | "lg",
                            })
                          }
                          options={[
                            { value: "sm", label: "Small" },
                            { value: "md", label: "Medium" },
                            { value: "lg", label: "Large" },
                          ]}
                        />
                      </div>
                    )}

                    {/* The same Layout & Size block for every element type --
                        a heading, an input, a divider and a button all get
                        width, height, padding, spacing and typography. */}
                    <ElementLayoutPanel
                      style={selectedElement.elementStyle}
                      showHeight={selectedElement.type !== "divider"}
                      onChange={(patch) =>
                        updateElementProps(selectedElement.id, {
                          elementStyle: { ...selectedElement.elementStyle, ...patch },
                        })
                      }
                    />

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
                )}

                {/* 3. Selected Element Style Tab */}
                {selectedElement && rightTab === "style" && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">Custom Style</h3>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Overrides global theme for this specific element.
                      </p>
                    </div>

                    {/* Button Style */}
                    {selectedElement.type === "button" && (
                      <>
                        <label className="grid gap-1.5 text-xs font-medium">
                          Button Background Color
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedElement.elementStyle?.backgroundColor || design.buttonColor || "#0a0a0a"}
                              onChange={(e) =>
                                updateElementProps(selectedElement.id, {
                                  elementStyle: { ...selectedElement.elementStyle, backgroundColor: e.target.value },
                                })
                              }
                              className="h-8 w-8 cursor-pointer rounded border border-line"
                            />
                            <input
                              value={selectedElement.elementStyle?.backgroundColor || ""}
                              placeholder={design.buttonColor || "#0a0a0a"}
                              onChange={(e) =>
                                updateElementProps(selectedElement.id, {
                                  elementStyle: { ...selectedElement.elementStyle, backgroundColor: e.target.value },
                                })
                              }
                              className={inputClass}
                            />
                          </div>
                        </label>

                        <label className="grid gap-1.5 text-xs font-medium">
                          Button Text Color
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedElement.elementStyle?.textColor || design.buttonTextColor || "#ffffff"}
                              onChange={(e) =>
                                updateElementProps(selectedElement.id, {
                                  elementStyle: { ...selectedElement.elementStyle, textColor: e.target.value },
                                })
                              }
                              className="h-8 w-8 cursor-pointer rounded border border-line"
                            />
                            <input
                              value={selectedElement.elementStyle?.textColor || ""}
                              placeholder={design.buttonTextColor || "#ffffff"}
                              onChange={(e) =>
                                updateElementProps(selectedElement.id, {
                                  elementStyle: { ...selectedElement.elementStyle, textColor: e.target.value },
                                })
                              }
                              className={inputClass}
                            />
                          </div>
                        </label>

                        <div className="grid gap-1.5 text-xs font-medium">
                          <span>Button Corner Radius</span>
                          <CornerRadiusPicker
                            value={selectedElement.elementStyle?.borderRadius || design.borderRadius || ""}
                            onChange={(val) =>
                              updateElementProps(selectedElement.id, {
                                elementStyle: { ...selectedElement.elementStyle, borderRadius: val },
                              })
                            }
                          />
                        </div>
                      </>
                    )}

                    {/* Typography Style */}
                    {(selectedElement.type === "heading" || selectedElement.type === "text") && (
                      <>
                        <label className="grid gap-1.5 text-xs font-medium">
                          Text Color
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedElement.elementStyle?.textColor || design.textColor || "#0a0a0a"}
                              onChange={(e) =>
                                updateElementProps(selectedElement.id, {
                                  elementStyle: { ...selectedElement.elementStyle, textColor: e.target.value },
                                })
                              }
                              className="h-8 w-8 cursor-pointer rounded border border-line"
                            />
                            <input
                              value={selectedElement.elementStyle?.textColor || ""}
                              placeholder="#0a0a0a"
                              onChange={(e) =>
                                updateElementProps(selectedElement.id, {
                                  elementStyle: { ...selectedElement.elementStyle, textColor: e.target.value },
                                })
                              }
                              className={inputClass}
                            />
                          </div>
                        </label>

                        <div className="grid gap-1.5 text-xs font-medium">
                          <span>Text Alignment</span>
                          <div className="grid grid-cols-3 gap-1">
                            {(["left", "center", "right"] as const).map((align) => (
                              <button
                                key={align}
                                type="button"
                                onClick={() => {
                                  if (selectedElement.type === "heading") {
                                    updateElementProps(selectedElement.id, { headingAlign: align });
                                  } else {
                                    updateElementProps(selectedElement.id, { textAlign: align });
                                  }
                                }}
                                className={`rounded-lg border py-1.5 text-xs font-medium capitalize transition-colors ${
                                  (selectedElement.type === "heading" ? selectedElement.headingAlign : selectedElement.textAlign) === align
                                    ? "border-ink bg-ink text-white"
                                    : "border-line bg-white text-ink hover:border-ink"
                                }`}
                              >
                                {align}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Input Field Style */}
                    {isFieldElementType(selectedElement.type) && selectedElement.type !== "hidden" && (
                      <>
                        <label className="grid gap-1.5 text-xs font-medium">
                          Input Border Color
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedElement.elementStyle?.borderColor || design.borderColor || "#e2e2e0"}
                              onChange={(e) =>
                                updateElementProps(selectedElement.id, {
                                  elementStyle: { ...selectedElement.elementStyle, borderColor: e.target.value },
                                })
                              }
                              className="h-8 w-8 cursor-pointer rounded border border-line"
                            />
                            <input
                              value={selectedElement.elementStyle?.borderColor || ""}
                              placeholder={design.borderColor || "#e2e2e0"}
                              onChange={(e) =>
                                updateElementProps(selectedElement.id, {
                                  elementStyle: { ...selectedElement.elementStyle, borderColor: e.target.value },
                                })
                              }
                              className={inputClass}
                            />
                          </div>
                        </label>

                        <label className="grid gap-1.5 text-xs font-medium">
                          Input Background Color
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedElement.elementStyle?.backgroundColor || "#ffffff"}
                              onChange={(e) =>
                                updateElementProps(selectedElement.id, {
                                  elementStyle: { ...selectedElement.elementStyle, backgroundColor: e.target.value },
                                })
                              }
                              className="h-8 w-8 cursor-pointer rounded border border-line"
                            />
                            <input
                              value={selectedElement.elementStyle?.backgroundColor || ""}
                              placeholder="#ffffff"
                              onChange={(e) =>
                                updateElementProps(selectedElement.id, {
                                  elementStyle: { ...selectedElement.elementStyle, backgroundColor: e.target.value },
                                })
                              }
                              className={inputClass}
                            />
                          </div>
                        </label>

                        <div className="grid gap-1.5 text-xs font-medium">
                          <span>Corner Radius</span>
                          <CornerRadiusPicker
                            value={selectedElement.elementStyle?.borderRadius || design.borderRadius || ""}
                            onChange={(val) =>
                              updateElementProps(selectedElement.id, {
                                elementStyle: { ...selectedElement.elementStyle, borderRadius: val },
                              })
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </aside>
          )}
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
