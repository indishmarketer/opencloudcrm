"use client";

import { useCallback, useMemo, useState } from "react";
import {
  appendChild,
  directText,
  duplicateNode,
  isListable,
  isVoidTag,
  listablePositionOf,
  listableSlots,
  nodeAt,
  parseHtml,
  removeNode,
  nudgeNode,
  reorderAmongListable,
  samePath,
  serializeHtml,
  setDirectText,
  updateNode,
  type HtmlNode,
  type NodePath,
} from "@/lib/htmlTree";
import BrandSelect from "@/components/BrandSelect";

/** Elements mode: the same custom section the Code tab shows as HTML,
 * presented as a tree you click, retype and drag.
 *
 * The HTML string stays the only stored value -- this parses it on every
 * render and serializes straight back on every edit (see
 * src/lib/htmlTree.ts), so the two modes cannot drift out of sync. The
 * cost is that it re-parses on each keystroke, which for a section-sized
 * document is nothing next to the React render it is already doing.
 *
 * Reordering is restricted to siblings on purpose: dragging an element
 * into a different container silently changes which CSS rules reach it,
 * so it reads as the design breaking rather than as a move. */

const row = "flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight";
const iconButton = "shrink-0 rounded p-0.5 text-ink-soft transition-colors hover:bg-paper-soft hover:text-ink";
const fieldLabel = "block text-[10px] font-semibold uppercase tracking-wider text-ink-soft";
const field =
  "mt-1 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-ink outline-none transition-colors focus:border-ink";

const Chevron = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/** Rows are keyed by path so collapse state survives an edit elsewhere in
 * the tree; it only resets when the node at that path really goes away. */
const keyOf = (path: NodePath) => path.join(".");

function TreeRow({
  node,
  path,
  selected,
  expanded,
  siblings,
  position,
  onToggle,
  onSelect,
  onMove,
  onReorder,
  onDuplicate,
  onDelete,
  dragging,
  setDragging,
}: {
  node: HtmlNode;
  path: NodePath;
  selected: NodePath | null;
  expanded: Set<string>;
  /** The whole sibling list, not just its length: whether an arrow is
   * usable depends on there being another *listed* sibling that way, not
   * on the raw index, since whitespace text nodes sit between elements. */
  siblings: HtmlNode[];
  /** This row's place among its listed siblings (whitespace skipped). */
  position: number;
  onToggle: (key: string) => void;
  onSelect: (path: NodePath) => void;
  onMove: (path: NodePath, direction: 1 | -1) => void;
  onReorder: (path: NodePath, toPosition: number) => void;
  onDuplicate: (path: NodePath) => void;
  onDelete: (path: NodePath) => void;
  dragging: NodePath | null;
  setDragging: (path: NodePath | null) => void;
}) {
  const [dropSide, setDropSide] = useState<"above" | "below" | null>(null);
  const isSelected = samePath(selected, path);
  const children = node.kind === "element" ? node.children : [];
  const listable = children.filter(isListable);
  const key = keyOf(path);
  const open = expanded.has(key);
  const visibleCount = siblings.filter(isListable).length;
  const canMoveUp = position > 0;
  const canMoveDown = position < visibleCount - 1;

  // Only a sibling can be dropped here: same depth, same parent, not
  // itself. Anything else leaves dropSide null so no line is drawn and
  // the drop is ignored.
  const canAccept =
    dragging !== null &&
    dragging.length === path.length &&
    !samePath(dragging, path) &&
    dragging.slice(0, -1).every((value, depth) => value === path[depth]);

  return (
    <li>
      <div
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          // Firefox refuses to start a drag with nothing on the transfer.
          event.dataTransfer.setData("text/plain", key);
          setDragging(path);
        }}
        onDragEnd={() => {
          setDragging(null);
          setDropSide(null);
        }}
        onDragOver={(event) => {
          if (!canAccept) return;
          event.preventDefault();
          event.stopPropagation();
          const box = event.currentTarget.getBoundingClientRect();
          setDropSide(event.clientY < box.top + box.height / 2 ? "above" : "below");
        }}
        onDragLeave={() => setDropSide(null)}
        onDrop={(event) => {
          if (!canAccept || !dropSide) return;
          event.preventDefault();
          event.stopPropagation();
          const from = listablePositionOf([{ kind: "element", tag: "x", attrs: [], children: siblings }], [0, dragging![dragging!.length - 1]]);
          // Dropping below a row that sits above the dragged one lands on
          // that row's own position once the node is lifted out, so the
          // target needs no further adjustment; dropping above it does.
          const base = dropSide === "below" ? position + 1 : position;
          onReorder(dragging!, from < base ? base - 1 : base);
          setDragging(null);
          setDropSide(null);
        }}
        className={`relative ${dropSide === "above" ? "before:absolute before:-top-px before:left-0 before:right-0 before:h-0.5 before:bg-ink" : ""} ${
          dropSide === "below" ? "after:absolute after:-bottom-px after:left-0 after:right-0 after:h-0.5 after:bg-ink" : ""
        }`}
      >
        <div className={`${row} group cursor-grab ${isSelected ? "bg-ink text-paper" : "hover:bg-paper-soft"}`}>
          {listable.length > 0 ? (
            <button type="button" onClick={() => onToggle(key)} aria-label={open ? "Collapse" : "Expand"} className="shrink-0">
              <Chevron open={open} />
            </button>
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <button type="button" onClick={() => onSelect(path)} className="min-w-0 flex-1 truncate">
            {node.kind === "text" ? (
              <span className={isSelected ? "text-paper/80" : "text-ink-soft"}>&ldquo;{node.text.trim().slice(0, 28)}&rdquo;</span>
            ) : (
              describeNode(node).label
            )}
          </button>
          <span className={`flex shrink-0 gap-0.5 ${isSelected ? "" : "opacity-0 transition-opacity group-hover:opacity-100"}`}>
            <button type="button" onClick={() => onMove(path, -1)} disabled={!canMoveUp} aria-label="Move up" title="Move up" className={`${iconButton} disabled:opacity-30`}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 14l6-6 6 6" /></svg>
            </button>
            <button type="button" onClick={() => onMove(path, 1)} disabled={!canMoveDown} aria-label="Move down" title="Move down" className={`${iconButton} disabled:opacity-30`}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 10l6 6 6-6" /></svg>
            </button>
            <button type="button" onClick={() => onDuplicate(path)} aria-label="Duplicate" title="Duplicate" className={iconButton}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>
            </button>
            <button type="button" onClick={() => onDelete(path)} aria-label="Delete" title="Delete" className={`${iconButton} hover:text-red-600`}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
        </div>
      </div>

      {open && listable.length > 0 && (
        <ul className="ml-3 border-l border-line pl-1">
          {children.map((child, childIndex) =>
            isListable(child) ? (
              <TreeRow
                key={keyOf([...path, childIndex])}
                node={child}
                path={[...path, childIndex]}
                siblings={children}
                position={listableSlots([{ kind: "element", tag: "x", attrs: [], children }], [0]).indexOf(childIndex)}
                selected={selected}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                onMove={onMove}
                onReorder={onReorder}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                dragging={dragging}
                setDragging={setDragging}
              />
            ) : null
          )}
        </ul>
      )}
    </li>
  );
}

const ELEMENT_NAMES: Record<string, string> = {
  h1: "Heading", h2: "Heading", h3: "Heading", h4: "Heading", h5: "Heading", h6: "Heading",
  p: "Paragraph", span: "Text", a: "Link", button: "Button", img: "Image", video: "Video",
  svg: "Icon", path: "Shape", circle: "Shape", rect: "Shape", ellipse: "Shape", line: "Shape", polygon: "Shape", polyline: "Shape", g: "Group",
  div: "Container", section: "Section", article: "Container", header: "Header", footer: "Footer",
  ul: "List", ol: "List", li: "List item",
  input: "Input", textarea: "Text area", select: "Dropdown", label: "Label", form: "Form",
  iframe: "Embed", script: "Script", style: "Style sheet", hr: "Divider", br: "Line break",
  table: "Table", tr: "Table row", td: "Cell", th: "Header cell",
};

function describeNode(node: HtmlNode): { label: string; tag: string } {
  if (node.kind === "text") return { label: "Text", tag: "" };
  if (node.kind === "comment") return { label: "Comment", tag: "" };
  return { label: ELEMENT_NAMES[node.tag] || node.tag, tag: node.tag };
}

type FieldKind = "text" | "url" | "number" | "color" | "toggle" | "select";

/** Human-word fields for the attributes an ordinary editor is most likely
 * to reach for. Anything not listed here still shows up under "More
 * options", so nothing becomes un-editable -- it is just not front and
 * centre when someone only wants to change a heading, link or color. */
const ATTR_FIELDS: Record<string, { label: string; kind: FieldKind; options?: string[] }> = {
  href: { label: "Link", kind: "url" },
  src: { label: "Source", kind: "url" },
  poster: { label: "Preview image", kind: "url" },
  alt: { label: "Description", kind: "text" },
  title: { label: "Tooltip", kind: "text" },
  placeholder: { label: "Placeholder", kind: "text" },
  value: { label: "Value", kind: "text" },
  name: { label: "Name", kind: "text" },
  type: { label: "Type", kind: "text" },
  "aria-label": { label: "Accessible label", kind: "text" },
  target: { label: "Opens in", kind: "select", options: ["_self", "_blank"] },
  rel: { label: "Relationship", kind: "text" },
  width: { label: "Width", kind: "number" },
  height: { label: "Height", kind: "number" },
  "stroke-width": { label: "Outline width", kind: "number" },
  "font-size": { label: "Font size", kind: "number" },
  "font-weight": { label: "Text weight", kind: "select", options: ["300", "400", "500", "600", "700", "800", "900"] },
  "text-align": { label: "Text alignment", kind: "select", options: ["left", "center", "right", "justify"] },
  "line-height": { label: "Line spacing", kind: "number" },
  margin: { label: "Outer spacing", kind: "text" },
  padding: { label: "Inner spacing", kind: "text" },
  "border-width": { label: "Border width", kind: "number" },
  opacity: { label: "Opacity", kind: "number" },
  "border-radius": { label: "Corner roundness", kind: "number" },
  fill: { label: "Fill color", kind: "color" },
  stroke: { label: "Outline color", kind: "color" },
  color: { label: "Text color", kind: "color" },
  "background-color": { label: "Background color", kind: "color" },
  "border-color": { label: "Border color", kind: "color" },
  controls: { label: "Show controls", kind: "toggle" },
  autoplay: { label: "Autoplay", kind: "toggle" },
  muted: { label: "Muted", kind: "toggle" },
  loop: { label: "Loop", kind: "toggle" },
  checked: { label: "Checked", kind: "toggle" },
  disabled: { label: "Disabled", kind: "toggle" },
  selected: { label: "Selected", kind: "toggle" },
  loading: { label: "Lazy load", kind: "select", options: ["lazy", "eager"] },
};

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

function parseStyle(style: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of style.split(";")) {
    const i = part.indexOf(":");
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) map.set(key, value);
  }
  return map;
}

function serializeStyle(map: Map<string, string>): string {
  return Array.from(map.entries()).map(([key, value]) => `${key}: ${value}`).join("; ");
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const swatch = HEX_RE.test(value) ? value : "#000000";
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={swatch}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Pick a color"
        className="h-8 w-9 shrink-0 cursor-pointer rounded-md border border-line bg-paper p-0.5"
      />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="transparent" className={`${field} font-mono`} />
      {value && (
        <button type="button" onClick={() => onChange("")} title="Clear" className={`${iconButton} shrink-0`}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}
    </div>
  );
}

function FieldControl({
  spec,
  checked,
  onChange,
  onToggle,
}: {
  spec: { label: string; kind: FieldKind; options?: string[]; value: string };
  checked: boolean;
  onChange: (v: string) => void;
  onToggle: (on: boolean) => void;
}) {
  if (spec.kind === "toggle") {
    return (
      <label className="flex items-center justify-between gap-3 py-0.5">
        <span className="text-xs font-medium text-ink">{spec.label}</span>
        <input type="checkbox" checked={checked} onChange={(event) => onToggle(event.target.checked)} className="h-4 w-4" />
      </label>
    );
  }
  if (spec.kind === "color") {
    return (
      <div className="grid gap-1.5">
        <span className={fieldLabel}>{spec.label}</span>
        <ColorInput value={spec.value} onChange={onChange} />
      </div>
    );
  }
  if (spec.kind === "select") {
    return (
      <div className="grid gap-1.5">
        <span className={fieldLabel}>{spec.label}</span>
        <BrandSelect value={spec.value} onChange={onChange} options={[{ value: "", label: "Default" }, ...(spec.options || []).map((option) => ({ value: option, label: option }))]} />
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      <span className={fieldLabel}>{spec.label}</span>
      {spec.kind === "number" ? (
        <div className="flex items-center gap-1">
          <button type="button" aria-label={`Decrease ${spec.label.toLowerCase()}`} onClick={() => onChange(String(Math.max(0, (parseFloat(spec.value) || 0) - 1)))} className="h-8 w-8 rounded-md border border-line text-sm hover:bg-paper-soft">−</button>
          <input type="number" step="1" value={parseFloat(spec.value) || 0} onChange={(event) => onChange(event.target.value)} className={`${field} mt-0 text-center`} />
          <button type="button" aria-label={`Increase ${spec.label.toLowerCase()}`} onClick={() => onChange(String((parseFloat(spec.value) || 0) + 1))} className="h-8 w-8 rounded-md border border-line text-sm hover:bg-paper-soft">+</button>
        </div>
      ) : <input value={spec.value} onChange={(event) => onChange(event.target.value)} placeholder={spec.kind === "url" ? "https://…" : ""} className={field} />}
    </div>
  );
}

function Inspector({
  node,
  onChange,
  onAddChild,
}: {
  node: HtmlNode;
  onChange: (next: HtmlNode) => void;
  onAddChild: (tag: string) => void;
}) {
  const text = directText(node);

  if (node.kind !== "element") {
    return (
      <div>
        <label className={fieldLabel}>{node.kind === "comment" ? "Comment" : "Text"}</label>
        <textarea
          value={node.text}
          onChange={(event) => onChange({ ...node, text: event.target.value })}
          rows={4}
          className={field}
        />
      </div>
    );
  }

  const attrs = new Map(node.attrs.map(([name, value]) => [name, value]));
  const styleMap = parseStyle(attrs.get("style") || "");

  const setAttr = (name: string, value: string) => {
    const existing = node.attrs.findIndex(([attrName]) => attrName === name);
    // Clearing a field removes the attribute rather than leaving class=""
    // behind, which would be noise in the saved HTML.
    if (existing === -1) {
      if (!value) return;
      onChange({ ...node, attrs: [...node.attrs, [name, value]] });
      return;
    }
    const next = [...node.attrs];
    if (!value && name !== "alt") next.splice(existing, 1);
    else next[existing] = [name, value];
    onChange({ ...node, attrs: next });
  };

  const setStyleKey = (key: string, value: string) => {
    if (value) styleMap.set(key, value);
    else styleMap.delete(key);
    setAttr("style", serializeStyle(styleMap));
  };

  const setToggle = (name: string, on: boolean) => {
    const exists = node.attrs.some(([attrName]) => attrName === name);
    if (on && !exists) onChange({ ...node, attrs: [...node.attrs, [name, ""]] });
    else if (!on && exists) onChange({ ...node, attrs: node.attrs.filter(([attrName]) => attrName !== name) });
  };

  const fields: { key: string; label: string; kind: FieldKind; options?: string[]; value: string; source: "attr" | "style" }[] = [];
  for (const [name, value] of node.attrs) {
    if (name === "style") continue;
    const ui = ATTR_FIELDS[name];
    if (ui) fields.push({ key: name, label: ui.label, kind: ui.kind, options: ui.options, value, source: "attr" });
  }
  for (const [key, value] of styleMap) {
    const ui = ATTR_FIELDS[key];
    if (ui) fields.push({ key, label: ui.label, kind: ui.kind, options: ui.options, value, source: "style" });
  }
  for (const key of ["font-size", "color", "background-color", "text-align", "font-weight", "line-height", "margin", "padding", "border-width", "border-color", "border-radius", "opacity"]) {
    if (styleMap.has(key) || fields.some((field) => field.source === "style" && field.key === key)) continue;
    const ui = ATTR_FIELDS[key];
    if (ui) fields.push({ key, label: ui.label, kind: ui.kind, options: ui.options, value: "", source: "style" });
  }

  // Everything else (raw geometry, class/id/style, unknown attributes) is
  // still editable, just tucked away so the first screen stays simple.
  const extras = node.attrs.filter(([name]) => name !== "class" && name !== "id" && name !== "style" && !ATTR_FIELDS[name]);

  return (
    <div className="space-y-3">
      {text !== null ? (
        <div>
          <label className={fieldLabel}>Text</label>
          <textarea value={text} onChange={(event) => onChange(setDirectText(node, event.target.value))} rows={3} className={field} />
        </div>
      ) : (
        <p className="text-[11px] text-ink-soft">
          This element holds other elements, so its text is edited on the child nodes above.
        </p>
      )}

      {fields.map((f) => (
        <FieldControl
          key={`${f.source}:${f.key}`}
          spec={{ label: f.label, kind: f.kind, options: f.options, value: f.value }}
          checked={f.kind === "toggle" && attrs.has(f.key)}
          onChange={(value) => (f.source === "style" ? setStyleKey(f.key, value) : setAttr(f.key, value))}
          onToggle={(on) => setToggle(f.key, on)}
        />
      ))}

      <details className="rounded-lg border border-line">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink-soft">More options</summary>
        <div className="space-y-3 border-t border-line p-3">
          <div>
            <label className={fieldLabel}>Element</label>
            <input value={node.tag} onChange={(event) => onChange({ ...node, tag: event.target.value.trim().toLowerCase() })} className={`${field} font-mono`} />
          </div>
          <div>
            <label className={fieldLabel}>Class</label>
            <input value={attrs.get("class") ?? ""} onChange={(event) => setAttr("class", event.target.value)} className={`${field} font-mono`} />
          </div>
          <div>
            <label className={fieldLabel}>ID</label>
            <input value={attrs.get("id") ?? ""} onChange={(event) => setAttr("id", event.target.value)} className={`${field} font-mono`} />
          </div>
          <div>
            <label className={fieldLabel}>Inline style</label>
            <textarea value={attrs.get("style") ?? ""} onChange={(event) => setAttr("style", event.target.value)} rows={3} className={`${field} font-mono`} />
          </div>

          {extras.length > 0 && (
            <div className="space-y-2 border-t border-line pt-3">
              <p className={fieldLabel}>Other attributes</p>
              {extras.map(([name, value]) => (
                <div key={name} className="flex items-end gap-1">
                  <div className="min-w-0 flex-1">
                    <label className="block truncate font-mono text-[10px] text-ink-soft">{name}</label>
                    <input value={value} onChange={(event) => setAttr(name, event.target.value)} className={`${field} mt-0.5 font-mono`} />
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange({ ...node, attrs: node.attrs.filter(([attrName]) => attrName !== name) })}
                    aria-label={`Remove ${name}`}
                    className={`${iconButton} mb-1.5 hover:text-red-600`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <AttributeAdder onAdd={setAttr} existing={node.attrs.map(([name]) => name)} />

          {!isVoidTag(node.tag) && (
            <div className="border-t border-line pt-3">
              <p className={fieldLabel}>Add inside this element</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {["div", "p", "h2", "h3", "span", "a", "img", "ul", "li", "button"].map((tag) => (
                  <button key={tag} type="button" onClick={() => onAddChild(tag)} className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-soft transition-colors hover:border-ink hover:text-ink">
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

function AttributeAdder({ onAdd, existing }: { onAdd: (name: string, value: string) => void; existing: string[] }) {
  const [name, setName] = useState("");
  const clean = name.trim().toLowerCase();
  // Anything that is not a legal attribute name would serialize into
  // broken markup, so the button simply stays off until it is one.
  const valid = /^[a-z_:][a-z0-9_:.-]*$/.test(clean) && !existing.includes(clean);
  return (
    <div className="flex items-end gap-1">
      <div className="min-w-0 flex-1">
        <label className={fieldLabel}>Add attribute</label>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="data-role" className={`${field} font-mono`} />
      </div>
      <button
        type="button"
        disabled={!valid}
        onClick={() => {
          onAdd(clean, " ");
          setName("");
        }}
        className="mb-px rounded-md border border-line px-2 py-1.5 text-xs transition-colors hover:border-ink disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}

export default function HtmlTreeEditor({
  html,
  onChange,
  selected,
  onSelect,
}: {
  html: string;
  onChange: (html: string) => void;
  selected: NodePath | null;
  onSelect: (path: NodePath | null) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["0"]));
  const [dragging, setDragging] = useState<NodePath | null>(null);

  // Parsed fresh from the stored HTML every render: there is no second
  // copy of the document to keep in step.
  const tree = useMemo(() => {
    try {
      return parseHtml(html);
    } catch {
      return [];
    }
  }, [html]);

  const apply = useCallback((next: HtmlNode[]) => onChange(serializeHtml(next)), [onChange]);
  const toggle = useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectedNode = selected ? nodeAt(tree, selected) : null;
  const listable = tree.filter(isListable);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line p-1.5">
        {listable.length === 0 ? (
          <p className="px-1.5 py-2 text-[11px] text-ink-soft">
            Nothing here yet. Switch to Code and write some HTML, or add a first element below.
          </p>
        ) : (
          <ul>
            {tree.map((node, index) =>
              isListable(node) ? (
                <TreeRow
                  key={keyOf([index])}
                  node={node}
                  path={[index]}
                  siblings={tree}
                  position={listableSlots(tree, []).indexOf(index)}
                  selected={selected}
                  expanded={expanded}
                  onToggle={toggle}
                  onSelect={onSelect}
                  onMove={(path, direction) => apply(nudgeNode(tree, path, direction))}
                  onReorder={(path, toPosition) => apply(reorderAmongListable(tree, path, toPosition))}
                  onDuplicate={(path) => apply(duplicateNode(tree, path))}
                  onDelete={(path) => {
                    apply(removeNode(tree, path));
                    if (samePath(selected, path)) onSelect(null);
                  }}
                  dragging={dragging}
                  setDragging={setDragging}
                />
              ) : null
            )}
          </ul>
        )}
        <button
          type="button"
          onClick={() => apply(appendChild(tree, [], { kind: "element", tag: "section", attrs: [], children: [] }))}
          className="mt-1 w-full rounded-md border border-dashed border-line px-2 py-1.5 text-[11px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          + Add element at the end
        </button>
      </div>

      {selectedNode && selected ? (
        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">
              {describeNode(selectedNode).label}
              {describeNode(selectedNode).tag && (
                <span className="ml-1 font-mono font-normal text-ink-soft">{describeNode(selectedNode).tag}</span>
              )}
            </p>
            <button type="button" onClick={() => onSelect(null)} className="text-[11px] text-ink-soft hover:text-ink">
              Deselect
            </button>
          </div>
          <Inspector
            node={selectedNode}
            onChange={(next) =>
              apply(
                updateNode(
                  tree,
                  selected,
                  next.kind === "element" ? { tag: next.tag, attrs: next.attrs, children: next.children } : { text: next.text }
                )
              )
            }
            onAddChild={(tag) => {
              apply(appendChild(tree, selected, { kind: "element", tag, attrs: [], children: [] }));
              setExpanded((current) => new Set(current).add(keyOf(selected)));
            }}
          />
        </div>
      ) : (
        <p className="border-t border-line pt-4 text-[11px] text-ink-soft">
          Pick an element above, or click one on the page, to edit its text and attributes. Drag a row, or use the arrows, to reorder it among its siblings.
        </p>
      )}
    </div>
  );
}
