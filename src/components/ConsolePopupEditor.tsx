"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FieldGroup } from "@/components/PageBlockFields";
import ElementsPalette from "@/components/pageEditor/ElementsPalette";
import { NestedElementFrame } from "@/components/pageEditor/LiveBlockFrame";
import {
  BLOCK_DEFS,
  blockFields,
  createBlock,
  styleFields,
  type PageBlock,
} from "@/lib/pageBlocks";
import { DEFAULT_POPUP_SETTINGS, type PopupSettings } from "@/lib/popupsShape";

/** The popup designer.
 *
 * A popup holds ordinary page elements, so this reuses the page editor's
 * own pieces -- the element definitions, the select/hover frame, and the
 * property/style inspector -- rather than reimplementing them. Anything
 * added to the page builder appears here automatically, which is the whole
 * reason popups are stored as `blocks`. */

type Values = Record<string, unknown>;

const INLINE_TEXT_FIELD: Record<string, string> = {
  heading: "text",
  richText: "html",
  button: "label",
  icon: "label",
  image: "caption",
  video: "caption",
};

const button =
  "inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink disabled:opacity-50";
const primaryButton =
  "inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50";

export default function ConsolePopupEditor({
  popup,
}: {
  popup: { id: number; name: string; blocks: PageBlock[]; settings: PopupSettings };
}) {
  const router = useRouter();
  const [name, setName] = useState(popup.name);
  const [blocks, setBlocks] = useState<PageBlock[]>(popup.blocks);
  const [settings, setSettings] = useState<PopupSettings>({ ...DEFAULT_POPUP_SETTINGS, ...popup.settings });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const elementDefs = BLOCK_DEFS.filter((def) => def.nestable);
  const selected = blocks.find((b) => b.id === selectedId) || null;
  const selectedDef = selected ? BLOCK_DEFS.find((d) => d.type === selected.type) : null;

  const change = useCallback((next: PageBlock[]) => {
    setBlocks(next);
    setDirty(true);
  }, []);

  function addElement(type: string) {
    const block = createBlock(type);
    change([...blocks, block]);
    setSelectedId(block.id);
  }

  function updateProps(id: string, next: Values) {
    change(blocks.map((b) => (b.id === id ? { ...b, props: next } : b)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    change(next);
  }

  const save = useCallback(async () => {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/console/popups/${popup.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, blocks, settings }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    setBusy(false);
    if (!res?.ok) {
      setError(body.error || "Could not save this popup.");
      return false;
    }
    setDirty(false);
    setMessage("Saved.");
    setTimeout(() => setMessage(""), 2500);
    router.refresh();
    return true;
  }, [blocks, name, popup.id, router, settings]);

  // Ctrl/Cmd+S, the same shortcut the page and form editors use.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function inlineEditFor(block: PageBlock) {
    const key = INLINE_TEXT_FIELD[block.type];
    if (!key || block.id !== selectedId) return undefined;
    return {
      value: typeof block.props[key] === "string" ? (block.props[key] as string) : "",
      onChange: (v: string) => updateProps(block.id, { ...block.props, [key]: v }),
    };
  }

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white text-ink">
      <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/console/popups" aria-label="All popups" className="text-sm text-ink-soft underline">
            ← Popups
          </Link>
          <span className={`h-2 w-2 shrink-0 rounded-full ${dirty ? "bg-amber-500" : "bg-green-500"}`} aria-hidden="true" />
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            className="truncate rounded border-b border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-line focus:border-ink"
            placeholder="Popup name"
          />
          {error && <span className="truncate text-xs text-red-600">{error}</span>}
          {message && <span className="text-xs text-ink-soft">{message}</span>}
        </div>
        <button type="button" onClick={() => void save()} disabled={busy || !dirty} className={primaryButton}>
          {busy ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-[220px] shrink-0 overflow-y-auto border-r border-line p-3">
          <ElementsPalette defs={elementDefs} onPick={addElement} />
        </aside>

        {/* The canvas shows the popup at its real width, over a dimmed
            backdrop, so what you design is what a visitor sees. */}
        <main
          onClick={() => setSelectedId(null)}
          className="relative min-w-0 flex-1 overflow-y-auto p-8"
          style={{ backgroundColor: `rgba(10,10,10,${settings.overlayOpacity / 100})` }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: settings.maxWidth,
              padding: settings.padding,
              borderRadius: settings.borderRadius,
              backgroundColor: settings.backgroundColor || undefined,
            }}
            className="mx-auto w-full bg-paper shadow-2xl"
          >
            {blocks.length === 0 ? (
              <p className="py-12 text-center text-sm text-ink-soft">
                Empty popup. Add a heading, text, an image, a button or a form from the left.
              </p>
            ) : (
              blocks.map((block, i) => (
                <NestedElementFrame
                  key={block.id}
                  block={block}
                  selected={block.id === selectedId}
                  onSelect={() => setSelectedId(block.id)}
                  onMoveUp={() => move(i, -1)}
                  onMoveDown={() => move(i, 1)}
                  onRemove={() => {
                    change(blocks.filter((b) => b.id !== block.id));
                    if (selectedId === block.id) setSelectedId(null);
                  }}
                  canMoveUp={i > 0}
                  canMoveDown={i < blocks.length - 1}
                  inlineEdit={inlineEditFor(block)}
                />
              ))
            )}
          </div>
        </main>

        <aside className="w-[340px] shrink-0 space-y-5 overflow-y-auto border-l border-line p-4">
          {selected && selectedDef ? (
            <>
              <div>
                <h2 className="text-sm font-semibold text-ink">{selectedDef.label}</h2>
                {selectedDef.description && <p className="mt-0.5 text-xs text-ink-soft">{selectedDef.description}</p>}
              </div>
              <FieldGroup
                fields={blockFields(selectedDef)}
                values={selected.props}
                onChange={(next) => updateProps(selected.id, next)}
                linkOptions={[]}
              />
              <div className="space-y-4 border-t border-line pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">Style</h3>
                <FieldGroup
                  fields={styleFields(selectedDef)}
                  values={selected.props}
                  onChange={(next) => updateProps(selected.id, next)}
                  linkOptions={[]}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <h2 className="text-sm font-semibold text-ink">Popup</h2>
                <p className="mt-0.5 text-xs text-ink-soft">
                  The dialog itself. Select an element on the canvas to edit that element instead.
                </p>
              </div>
              <label className="grid gap-1.5 text-sm font-medium">
                Width (px)
                <input
                  type="number"
                  min={240}
                  max={1200}
                  value={settings.maxWidth}
                  onChange={(e) => {
                    setSettings({ ...settings, maxWidth: Number(e.target.value) || 480 });
                    setDirty(true);
                  }}
                  className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Padding (px)
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={settings.padding}
                  onChange={(e) => {
                    setSettings({ ...settings, padding: Number(e.target.value) || 0 });
                    setDirty(true);
                  }}
                  className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Corner roundness (px)
                <input
                  type="number"
                  min={0}
                  max={64}
                  value={settings.borderRadius}
                  onChange={(e) => {
                    setSettings({ ...settings, borderRadius: Number(e.target.value) || 0 });
                    setDirty(true);
                  }}
                  className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Backdrop darkness (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settings.overlayOpacity}
                  onChange={(e) => {
                    setSettings({ ...settings, overlayOpacity: Number(e.target.value) || 0 });
                    setDirty(true);
                  }}
                  className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Background colour
                <input
                  value={settings.backgroundColor}
                  placeholder="Leave blank for the theme's surface"
                  onChange={(e) => {
                    setSettings({ ...settings, backgroundColor: e.target.value });
                    setDirty(true);
                  }}
                  className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </label>
              <p className="text-xs text-ink-soft">
                Open this popup from any page: add a Button and set &quot;Button opens&quot; to &quot;A popup&quot;, or
                select text and add a link set to &quot;Open a popup&quot; -- then pick this one.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
