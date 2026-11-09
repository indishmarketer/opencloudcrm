"use client";

import { useEffect, useRef } from "react";
import { scopeCss } from "@/lib/scopedCss";
import { Section, str, type Props } from "@/components/pageBlocks/blockViews";
import type { NodePath } from "@/lib/htmlTree";

/** The "custom" block: a section whose design is written by hand (or by an
 * API/MCP client) as real HTML, a real stylesheet and optional JavaScript,
 * instead of being assembled out of the pre-made section library.
 *
 * Three things make it genuinely open-ended rather than another template:
 *
 * 1. The CSS is a real stylesheet, scoped to this one section (see
 *    src/lib/scopedCss.ts). That matters because the site's Tailwind
 *    classes are NOT usable in hand-written HTML -- Tailwind only emits
 *    classes it can see spelled out in the app's own source, so a
 *    `class="grid grid-cols-3"` typed into a DB field produces exactly
 *    nothing. Authoring CSS is the only way a bespoke layout can work at
 *    all, which is why the block carries a css field rather than hoping
 *    utility classes resolve.
 * 2. `width: "full"` drops the site container entirely, so a design can be
 *    edge-to-edge instead of being forced into the standard content column
 *    (the reason a horizontal image used to end up squeezed into the hero
 *    block's portrait frame).
 * 3. Script tags actually run. React's dangerouslySetInnerHTML never
 *    executes a <script> it inserts -- the browser only runs scripts it
 *    parsed itself -- so each one is swapped for a freshly created element
 *    after mount, and the js field is appended as its own inline script
 *    with `root` already bound to this section.
 *
 * The HTML/CSS are server-rendered as written, so the section's real text
 * is in the page source for search engines; only script execution waits
 * for the client.
 *
 * No sanitizing, deliberately -- same posture as the long-standing
 * customCode block: writing a page already requires an admin session or an
 * API token with pages:write, so this is not a new trust boundary, just a
 * bigger canvas behind the same door.
 *
 * `editing` is passed only by the console's canvas and is what makes
 * Elements mode feel direct: clicking any element reports its node path
 * so the tree panel can select it, and the selected node is outlined in
 * place. The path is the chain of childNodes indices, which works because
 * the tree is parsed with the same mechanism this renders with (a div's
 * innerHTML) -- so no editing ids are ever injected into the markup, and
 * what the public site serves is byte-identical with or without the
 * editor. Links are also neutralized while editing, since clicking a
 * button to select it should not navigate away mid-edit. */

const CONTENT_WIDTH: Record<string, string> = { site: "max-w-6xl", wide: "max-w-7xl" };

export type CustomBlockEditing = {
  selectedPath: NodePath | null;
  onSelectPath: (path: NodePath | null) => void;
};

/** The chain of childNodes indices from the block root down to `target`,
 * or null if the target is not inside this block. Text nodes count, which
 * is exactly what makes this comparable with the parsed tree. */
function pathFromDom(root: HTMLElement, target: Node): NodePath | null {
  const path: NodePath = [];
  let node: Node | null = target;
  while (node && node !== root) {
    const parent: Node | null = node.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, node));
    node = parent;
  }
  return node === root ? path : null;
}

function domAtPath(root: HTMLElement, path: NodePath): Node | null {
  let node: Node = root;
  for (const index of path) {
    const child: Node | undefined = node.childNodes[index];
    if (!child) return null;
    node = child;
  }
  return node;
}

export default function CustomBlock({
  props,
  blockId,
  editing,
  editorEmpty = false,
}: {
  props: Props;
  blockId: string;
  editing?: CustomBlockEditing;
  /** A freshly-added block has no html/css yet, and this renders nothing
   * until it does -- right for the public site, wrong for the editor
   * canvas, where that makes the block invisible and unselectable. Only
   * the editor's own call site (LiveBlockFrame) passes this. */
  editorEmpty?: boolean;
}) {
  const html = str(props, "html");
  const css = str(props, "css");
  const js = str(props, "js");
  const rootRef = useRef<HTMLDivElement>(null);

  // A <script> arriving via innerHTML is inert by spec. Replacing each one
  // with an identical, freshly created element is what makes the browser
  // treat it as a script to run -- without this, every embed snippet
  // pasted into the HTML field would silently do nothing.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    for (const stale of Array.from(root.querySelectorAll("script"))) {
      const fresh = document.createElement("script");
      for (const attr of Array.from(stale.attributes)) fresh.setAttribute(attr.name, attr.value);
      fresh.textContent = stale.textContent;
      stale.replaceWith(fresh);
    }
  }, [html]);

  // The js field, as its own inline <script> rather than new Function():
  // the site's CSP allows 'unsafe-inline' but not 'unsafe-eval', so an
  // eval-family call would be blocked outright while an inline script tag
  // is exactly what the policy already permits.
  useEffect(() => {
    if (!js.trim()) return;
    const element = document.createElement("script");
    element.textContent = `(function(){var root=document.getElementById(${JSON.stringify(blockId)});if(!root)return;\n${js}\n})();`;
    document.body.appendChild(element);
    return () => element.remove();
  }, [js, blockId]);

  // Outlines the selected node in place. Written straight onto the
  // rendered element rather than through React, because this subtree is
  // innerHTML and React has no nodes here to hand a prop to. Re-runs
  // whenever the HTML changes, since React replaces the subtree then and
  // the previous outline goes with it.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !editing) return;
    const target = editing.selectedPath ? domAtPath(root, editing.selectedPath) : null;
    const element = target && target.nodeType === 1 ? (target as HTMLElement) : null;
    if (!element) return;
    const previous = { outline: element.style.outline, offset: element.style.outlineOffset };
    element.style.outline = "2px solid #0a0a0a";
    element.style.outlineOffset = "1px";
    return () => {
      element.style.outline = previous.outline;
      element.style.outlineOffset = previous.offset;
    };
  }, [editing, html]);

  if (!html && !css) {
    if (!editorEmpty) return null;
    return (
      <Section props={props}>
        <div className="flex min-h-[96px] items-center justify-center rounded-xl border border-dashed border-line bg-paper-soft px-6 py-8 text-center text-sm text-ink-soft">
          Add your HTML and CSS in the panel on the right
        </div>
      </Section>
    );
  }

  const width = str(props, "width") || "site";
  const bare = props.bare === true;
  // Reuses the shared Section wrapper (background band, anchor, margins,
  // corner radius, the Style tab's overrides) by pre-setting the handful of
  // its props this block's own plain-language Width/No-padding fields
  // stand for, rather than reimplementing any of that layout here.
  const sectionProps: Props = {
    ...props,
    ...(width === "full" ? { maxWidth: "full", paddingX: "none" } : {}),
    ...(bare ? { spacing: "none", paddingY: "none" } : {}),
  };

  return (
    <Section props={sectionProps} width={CONTENT_WIDTH[width] ?? CONTENT_WIDTH.site}>
      {css && <style dangerouslySetInnerHTML={{ __html: scopeCss(css, blockId) }} />}
      <div
        id={blockId}
        ref={rootRef}
        onClick={
          editing
            ? (event) => {
                const root = rootRef.current;
                if (!root) return;
                // Selecting an element must not follow its link or submit
                // its form, and must not bubble up to the block-level
                // select either -- the node is the more specific target.
                event.preventDefault();
                event.stopPropagation();
                editing.onSelectPath(pathFromDom(root, event.target as Node));
              }
            : undefined
        }
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Section>
  );
}
