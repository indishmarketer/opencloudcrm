/** The bridge between a custom section's HTML source and an editable
 * element tree, so the same section can be worked on two ways: as code,
 * or as elements you click, retype and drag.
 *
 * The HTML string stays the single source of truth. Elements mode parses
 * it on the way in and serializes it back on every edit, rather than
 * keeping a second representation in the database. That is the whole
 * reason the two modes cannot drift: there is nothing to sync, because
 * there is only ever one stored value.
 *
 * Two consequences worth knowing, both deliberate:
 *
 * - The serializer is verbatim, not pretty-printing. Whitespace between
 *   elements is real text in HTML (it is the space between two inline
 *   spans), and reindenting would both change the render and churn the
 *   author's code every time the panel opened. So the author's own
 *   newlines and indentation survive as the text nodes they already are;
 *   the tree UI just doesn't list them.
 * - A node's path is its chain of child indices, counting text and
 *   comment nodes. That makes a path directly comparable with the live
 *   DOM's childNodes, which is how clicking an element on the canvas
 *   finds its node in the tree -- no ids injected into the markup, so
 *   what the public site renders is untouched by the editor existing.
 *
 * parseHtml() needs a browser (it borrows the real HTML parser rather
 * than hand-rolling one, since getting a fragment wrong here would lose
 * someone's work). Everything else is pure and runs anywhere. */

export type HtmlNode =
  | { kind: "element"; tag: string; attrs: [string, string][]; children: HtmlNode[] }
  | { kind: "text"; text: string }
  | { kind: "comment"; text: string };

/** Index chain from the top of the section to one node. */
export type NodePath = number[];

// Emitted without a closing tag, and never given children.
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

// Their text content is *not* escaped on the way out: inside these, "<"
// and "&" are literal characters, and escaping them would corrupt the
// CSS or JS they hold.
const RAW_TEXT_TAGS = new Set(["script", "style"]);

export const isVoidTag = (tag: string): boolean => VOID_TAGS.has(tag.toLowerCase());

export const isBlank = (node: HtmlNode): boolean => node.kind === "text" && node.text.trim() === "";

const escapeText = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function serializeHtml(nodes: HtmlNode[]): string {
  return nodes.map((node) => serializeNode(node)).join("");
}

function serializeNode(node: HtmlNode, rawText = false): string {
  if (node.kind === "text") return rawText ? node.text : escapeText(node.text);
  if (node.kind === "comment") return `<!--${node.text}-->`;
  const tag = node.tag.toLowerCase();
  const attrs = node.attrs
    .map(([name, value]) => (value === "" ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`))
    .join("");
  if (isVoidTag(tag)) return `<${tag}${attrs}>`;
  const raw = RAW_TEXT_TAGS.has(tag);
  const children = node.children.map((child) => serializeNode(child, raw)).join("");
  return `<${tag}${attrs}>${children}</${tag}>`;
}

/** Browser-only: parses a section's HTML into the tree, using exactly the
 * same mechanism the canvas uses to render it (a div's innerHTML), so the
 * resulting paths line up with the live DOM's childNodes one for one. */
export function parseHtml(html: string): HtmlNode[] {
  if (typeof document === "undefined") throw new Error("parseHtml needs a browser.");
  const host = document.createElement("div");
  host.innerHTML = html;
  return Array.from(host.childNodes).map(fromDomNode).filter((node): node is HtmlNode => node !== null);
}

function fromDomNode(node: ChildNode): HtmlNode | null {
  if (node.nodeType === 3) return { kind: "text", text: node.nodeValue ?? "" };
  if (node.nodeType === 8) return { kind: "comment", text: node.nodeValue ?? "" };
  if (node.nodeType !== 1) return null;
  const element = node as Element;
  return {
    kind: "element",
    tag: element.tagName.toLowerCase(),
    attrs: Array.from(element.attributes).map((a) => [a.name, a.value] as [string, string]),
    children: Array.from(element.childNodes).map(fromDomNode).filter((child): child is HtmlNode => child !== null),
  };
}

export function nodeAt(nodes: HtmlNode[], path: NodePath): HtmlNode | null {
  let current: HtmlNode | undefined = nodes[path[0]];
  for (let depth = 1; depth < path.length; depth++) {
    if (!current || current.kind !== "element") return null;
    current = current.children[path[depth]];
  }
  return current ?? null;
}

/** The siblings a path sits in, plus its index among them -- every
 * structural edit below is some operation on that one array. */
function siblingsOf(nodes: HtmlNode[], path: NodePath): { siblings: HtmlNode[]; index: number } | null {
  if (path.length === 0) return null;
  if (path.length === 1) return { siblings: nodes, index: path[0] };
  const parent = nodeAt(nodes, path.slice(0, -1));
  if (!parent || parent.kind !== "element") return null;
  return { siblings: parent.children, index: path[path.length - 1] };
}

/** Structural edits all go through a deep clone rather than mutating in
 * place: the tree is React state, and the canvas re-renders from the
 * serialized result, so an in-place mutation would be an invisible edit. */
const clone = (nodes: HtmlNode[]): HtmlNode[] => structuredClone(nodes);

export function updateNode(nodes: HtmlNode[], path: NodePath, change: Partial<Extract<HtmlNode, { kind: "element" }>> & { text?: string }): HtmlNode[] {
  const next = clone(nodes);
  const target = nodeAt(next, path);
  if (!target) return nodes;
  if (target.kind === "element") {
    if (change.tag !== undefined) target.tag = change.tag;
    if (change.attrs !== undefined) target.attrs = change.attrs;
    if (change.children !== undefined) target.children = change.children;
  } else if (change.text !== undefined) {
    target.text = change.text;
  }
  return next;
}

export function removeNode(nodes: HtmlNode[], path: NodePath): HtmlNode[] {
  const next = clone(nodes);
  const location = siblingsOf(next, path);
  if (!location || !location.siblings[location.index]) return nodes;
  location.siblings.splice(location.index, 1);
  return next;
}

/** Copies a node in beside itself, bringing its indentation along.
 *
 * The copy takes the whitespace that precedes the original with it, so
 * duplicating a list item in an indented document gives another item on
 * its own line rather than two jammed together -- the same reason
 * reorderAmongListable treats whitespace as a scaffold. Without this, a
 * few duplicates turn a readable section into one long line. */
export function duplicateNode(nodes: HtmlNode[], path: NodePath): HtmlNode[] {
  const next = clone(nodes);
  const location = siblingsOf(next, path);
  const node = location && location.siblings[location.index];
  if (!location || !node) return nodes;
  const indent = location.siblings[location.index - 1];
  const copies: HtmlNode[] = indent && isBlank(indent) ? [structuredClone(indent), structuredClone(node)] : [structuredClone(node)];
  location.siblings.splice(location.index + 1, 0, ...copies);
  return next;
}

export function insertNode(nodes: HtmlNode[], path: NodePath, node: HtmlNode): HtmlNode[] {
  const next = clone(nodes);
  const location = siblingsOf(next, path);
  if (!location) return nodes;
  location.siblings.splice(Math.max(0, Math.min(location.index, location.siblings.length)), 0, node);
  return next;
}

/** Appends inside an element, for "add a child here". */
export function appendChild(nodes: HtmlNode[], path: NodePath, node: HtmlNode): HtmlNode[] {
  const next = clone(nodes);
  if (path.length === 0) {
    next.push(node);
    return next;
  }
  const parent = nodeAt(next, path);
  if (!parent || parent.kind !== "element" || isVoidTag(parent.tag)) return nodes;
  parent.children.push(node);
  return next;
}

/** The raw child indices of one node's *listed* children, in order --
 * the elements and real text, skipping the whitespace between them. */
export function listableSlots(nodes: HtmlNode[], parentPath: NodePath): number[] {
  const children = parentPath.length === 0 ? nodes : (() => {
    const parent = nodeAt(nodes, parentPath);
    return parent && parent.kind === "element" ? parent.children : [];
  })();
  return children.flatMap((child, index) => (isListable(child) ? [index] : []));
}

/** Where a node sits among its listed siblings, which is the only
 * position the tree UI ever shows or talks about. */
export function listablePositionOf(nodes: HtmlNode[], path: NodePath): number {
  if (path.length === 0) return -1;
  return listableSlots(nodes, path.slice(0, -1)).indexOf(path[path.length - 1]);
}

/** Reorders a node among its listed siblings, leaving every whitespace
 * text node exactly where it is.
 *
 * Moving the node itself through the raw child list is what you reach for
 * first, and it is wrong: indented HTML has a newline-and-spaces text
 * node between every pair of elements, so lifting an element out and
 * dropping it elsewhere drags it away from its indentation and clumps the
 * leftover whitespace together. Two moves in and the source is a mess.
 *
 * So the whitespace is treated as a fixed scaffold: the listed children
 * are permuted among the slots they already occupy. Indentation is
 * preserved exactly, and a space between two inline elements stays a
 * single space instead of migrating.
 *
 * Only within one parent. Dragging an element into a different container
 * silently changes which CSS rules reach it, which reads as the design
 * breaking rather than as a move, so the tree reorders siblings only. */
export function reorderAmongListable(nodes: HtmlNode[], path: NodePath, toPosition: number): HtmlNode[] {
  if (path.length === 0) return nodes;
  const parentPath = path.slice(0, -1);
  const slots = listableSlots(nodes, parentPath);
  const from = slots.indexOf(path[path.length - 1]);
  if (from === -1 || toPosition < 0 || toPosition >= slots.length || toPosition === from) return nodes;

  const next = clone(nodes);
  const children = parentPath.length === 0 ? next : (nodeAt(next, parentPath) as Extract<HtmlNode, { kind: "element" }>).children;
  const listed = slots.map((slot) => children[slot]);
  const [moved] = listed.splice(from, 1);
  listed.splice(toPosition, 0, moved);
  slots.forEach((slot, position) => {
    children[slot] = listed[position];
  });
  return next;
}

/** Moves a node past its next visible sibling: what the up/down arrows
 * mean. A no-op at either visible end. */
export function nudgeNode(nodes: HtmlNode[], path: NodePath, direction: 1 | -1): HtmlNode[] {
  return reorderAmongListable(nodes, path, listablePositionOf(nodes, path) + direction);
}

/** Whether a node is worth showing as a row in the tree. Whitespace-only
 * text is kept in the data (it is the gap between two inline elements, so
 * dropping it would change the render) but listing it would bury the real
 * structure in blank rows. */
export const isListable = (node: HtmlNode): boolean => !isBlank(node);

/** The node's text, when it holds nothing but text -- the overwhelmingly
 * common edit ("change this heading"), offered as a single field instead
 * of making someone open a child node to retype a word. Null when the
 * element has element children, where one text field could not represent
 * it without throwing the rest away. */
export function directText(node: HtmlNode): string | null {
  if (node.kind === "text") return node.text;
  if (node.kind !== "element") return null;
  if (node.children.length === 0) return "";
  return node.children.every((child) => child.kind === "text") ? node.children.map((child) => (child as { text: string }).text).join("") : null;
}

export function setDirectText(node: HtmlNode, text: string): HtmlNode {
  if (node.kind !== "element") return { ...node, text };
  return { ...node, children: text === "" ? [] : [{ kind: "text", text }] };
}

/** A short label for a tree row: the tag with its id/first class, the way
 * a browser's own element picker reads (section.hero, a#cta). */
export function nodeLabel(node: HtmlNode): string {
  if (node.kind === "text") return "text";
  if (node.kind === "comment") return "comment";
  const attrs = new Map(node.attrs.map(([name, value]) => [name.toLowerCase(), value]));
  const id = attrs.get("id");
  if (id) return `${node.tag}#${id}`;
  const firstClass = (attrs.get("class") || "").trim().split(/\s+/).filter(Boolean)[0];
  return firstClass ? `${node.tag}.${firstClass}` : node.tag;
}

export const samePath = (a: NodePath | null, b: NodePath | null): boolean =>
  Boolean(a && b && a.length === b.length && a.every((value, index) => value === b[index]));

/** Attributes offered as named fields in the inspector, per tag -- the
 * ones that are nearly always the point of selecting that element.
 * Anything else is still editable through the free-form attribute list. */
export const COMMON_ATTRS: Record<string, string[]> = {
  a: ["href", "class", "target", "rel", "title"],
  img: ["src", "alt", "class", "width", "height", "loading"],
  video: ["src", "poster", "class", "controls", "autoplay", "muted", "loop"],
  source: ["src", "srcset", "type", "media"],
  button: ["class", "type", "aria-label"],
  input: ["type", "name", "placeholder", "value", "class"],
  svg: ["viewBox", "class", "width", "height", "fill", "stroke"],
  path: ["d", "fill", "stroke", "stroke-width"],
};

export const attrsFor = (tag: string): string[] => COMMON_ATTRS[tag.toLowerCase()] || ["class", "id", "style"];
