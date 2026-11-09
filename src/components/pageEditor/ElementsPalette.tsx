"use client";

import { useDraggable } from "@dnd-kit/core";
import { blockSummary, type BlockDef } from "@/lib/pageBlocks";
import { GROUP_ORDER } from "@/components/pageEditor/BlockTypePicker";
import BlockIcon, { iconKeyFor } from "@/components/pageEditor/blockIcons";

function PaletteItem({ def, onPick }: { def: BlockDef; onPick: (type: string) => void }) {
  // Draggable AND clickable: the DndContext's PointerSensor uses an
  // activation distance (see ConsolePageEditor), so a plain click never
  // starts a drag and this onClick still fires normally.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${def.type}`,
    data: { kind: "palette", blockType: def.type },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onPick(def.type)}
      title={blockSummary(def)}
      className={`flex cursor-grab touch-none flex-col items-center gap-1.5 rounded-xl border border-line bg-paper px-2 py-3 text-center transition-colors hover:border-ink hover:bg-paper-soft active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <BlockIcon type={iconKeyFor(def.type)} className="h-5 w-5 text-ink-soft" />
      <span className="text-[11px] font-medium leading-tight text-ink">{def.label}</span>
    </button>
  );
}

/** The left rail: every section type as a small icon tile, draggable onto
 * the canvas (or click to insert after the selected section / at the
 * end) -- labeled icons, not paragraphs of description text. Grouped by
 * Elements / Templates / Dynamic content (see GROUP_ORDER's doc comment),
 * not by content topic -- that's the axis that actually matters when
 * deciding what to drop. */
export default function ElementsPalette({ defs, onPick }: { defs: BlockDef[]; onPick: (type: string) => void }) {
  return (
    <div className="space-y-4">
      {GROUP_ORDER.map(({ group, label, hint }) => {
        const items = defs.filter((d) => d.group === group);
        if (!items.length) return null;
        return (
          <div key={group}>
            <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft" title={hint}>
              {label}
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {items.map((def) => (
                <PaletteItem key={def.type} def={def} onPick={onPick} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
