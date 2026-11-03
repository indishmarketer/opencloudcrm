"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Renders its children into a same-origin, blank iframe instead of inline
 * -- the iframe gets its own real browser viewport (its CSS width, set by
 * the caller), so the page content's Tailwind `md:`/`lg:` breakpoints
 * correctly evaluate as "mobile" instead of just being squeezed into a
 * narrow div in the same wide window. React keeps `children` in the same
 * component tree for context/state purposes (per-root event delegation
 * since React 17 is what makes portaled clicks/selection work normally),
 * only the DOM output moves -- so the canvas stays the exact same
 * interactive React state as the desktop canvas, just rendered at a real
 * phone width. The one thing that doesn't carry over: @dnd-kit's drag
 * tracking listens on the host window, which never sees pointer events
 * that happen inside the iframe's own document, so drag-to-reorder can't
 * work here -- the caller falls back to move-up/down buttons instead (see
 * TopBlockFrame's `interactive` prop). */
export default function MobileCanvasPortal({ children }: { children: React.ReactNode }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const setUpRef = useRef(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function setup() {
      if (setUpRef.current) return;
      const doc = iframe!.contentDocument;
      if (!doc) return;
      setUpRef.current = true;

      // Same-origin, so cloning is just copying already-loaded DOM nodes --
      // no extra network requests beyond what the browser already cached.
      for (const attr of Array.from(document.documentElement.attributes)) {
        doc.documentElement.setAttribute(attr.name, attr.value);
      }
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        doc.head.appendChild(node.cloneNode(true));
      });
      doc.body.className = document.body.className;
      doc.body.style.margin = "0";

      const root = doc.createElement("div");
      doc.body.appendChild(root);
      setMountNode(root);
    }

    if (iframe.contentDocument?.readyState === "complete") setup();
    iframe.addEventListener("load", setup);
    return () => iframe.removeEventListener("load", setup);
  }, []);

  return (
    <>
      <iframe ref={iframeRef} title="Mobile canvas" className="h-full min-h-[700px] w-full border-0 bg-white" />
      {mountNode && createPortal(children, mountNode)}
    </>
  );
}
