"use client";

import { useDraggable } from "@dnd-kit/core";
import type { EmailBlockDef } from "@/lib/emailBlocks";
import BlockIcon from "@/components/pageEditor/blockIcons";

/** The page editor's own ElementsPalette is typed directly to pageBlocks.ts's
 * BlockDef (and calls blockSummary(), also page-specific) -- rather than
 * loosen a shared, heavily-used component's public type to fit a second,
 * unrelated caller, this is its own small copy for EmailBlockDef. Reuses
 * the same BlockIcon glyph set (blockIcons.tsx), which already covers
 * most of this palette's types by name (heading/button/image/spacer/
 * socialIcons/divider) plus three added for the email builder itself
 * (text/columns/footer). */
function PaletteItem({ def, onPick }: { def: EmailBlockDef; onPick: (type: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `email-palette:${def.type}`,
    data: { kind: "email-palette", blockType: def.type },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onPick(def.type)}
      title={def.description}
      className={`flex cursor-grab touch-none flex-col items-center gap-1.5 rounded-xl border border-line bg-paper px-2 py-3 text-center transition-colors hover:border-ink hover:bg-paper-soft active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <BlockIcon type={def.type} className="h-5 w-5 text-ink-soft" />
      <span className="text-[11px] font-medium leading-tight text-ink">{def.label}</span>
    </button>
  );
}

export default function EmailElementsPalette({ defs, onPick }: { defs: EmailBlockDef[]; onPick: (type: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {defs.map((def) => (
        <PaletteItem key={def.type} def={def} onPick={onPick} />
      ))}
    </div>
  );
}
