"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** A panel pinned to the element that opened it, rendered at the top of the
 * document rather than inside the row it belongs to.
 *
 * Written for the WhatsApp template rows, where the groups menu was a plain
 * `absolute top-full` panel: on the last row it opened below the fold, so
 * reading it meant scrolling to the very bottom of the page, and on a
 * narrow screen it ran off the right edge. This measures the trigger and
 * the viewport instead, flips the panel above when there is not enough room
 * below, pins it to the trigger edge it is aligned to so it can only grow
 * inwards, and caps its width and height to the space it actually has. It
 * follows scrolling and resizing while open, and closes on Escape or a
 * click outside both itself and the trigger.
 *
 * Position is written straight onto the node rather than held in state:
 * the panel has to be in the DOM before it can be measured, and a state
 * round-trip for that would render it once in the wrong place. It starts
 * hidden and is revealed by the same pass that positions it. */
export default function AnchoredPopover({
  anchor,
  open,
  onClose,
  width = 288,
  align = "end",
  className = "",
  children,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** A pixel width, or "anchor" to match the trigger and grow from there to
   * fit its content (what a select's option list wants). */
  width?: number | "anchor";
  /** Which edge of the panel lines up with the same edge of the trigger. */
  align?: "start" | "end";
  className?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Deliberately not memoized, and the two rules disagree about that: it
  // reads .current off two refs, so react-hooks/preserve-manual-memoization
  // rejects any dependency list a useCallback could be given, while
  // exhaustive-deps would rather it had one. Re-running it on every render
  // of this component is the behaviour we want anyway -- the panel
  // repositions when its own content changes, and re-attaching two
  // listeners costs nothing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const place = () => {
    const trigger = anchor.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const rect = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const gap = 6;
    const edge = 12;
    const room = Math.max(160, vw - edge * 2);

    // Pinning the panel to the trigger edge it is aligned to (and giving
    // maxWidth the rest of the screen) keeps a wide option list on screen
    // without having to measure its content first.
    const least = width === "anchor" ? Math.min(rect.width, room) : Math.min(width, room);
    const inset = Math.min(Math.max(align === "end" ? vw - rect.right : rect.left, edge), Math.max(edge, vw - edge - least));

    const below = vh - rect.bottom - gap - edge;
    const above = rect.top - gap - edge;
    // Flip up only when below genuinely cannot hold a usable panel and
    // above is roomier, so a menu keeps its normal downward direction
    // everywhere except near the bottom of the screen.
    const flip = below < 200 && above > below;

    const style = panel.style;
    style.left = align === "end" ? "auto" : `${inset}px`;
    style.right = align === "end" ? `${inset}px` : "auto";
    style.top = flip ? "auto" : `${rect.bottom + gap}px`;
    style.bottom = flip ? `${vh - rect.top + gap}px` : "auto";
    style.width = width === "anchor" ? "max-content" : `${least}px`;
    style.minWidth = width === "anchor" ? `${least}px` : "auto";
    style.maxWidth = `${vw - edge - inset}px`;
    style.maxHeight = `${Math.max(140, flip ? above : below)}px`;
    style.visibility = "visible";
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    // Capture phase: the console's own scroll container scrolls, not the
    // window, and a scroll event does not bubble.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchor.current?.contains(target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchor]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", visibility: "hidden", top: 0, left: 0 }}
      className={`z-[80] overflow-y-auto overscroll-contain rounded-xl border border-line bg-paper shadow-xl ${className}`}
    >
      {children}
    </div>,
    document.body
  );
}
