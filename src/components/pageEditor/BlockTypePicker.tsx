"use client";

import ConsoleModal from "@/components/ConsoleModal";
import { blockSummary, type BlockCategory, type BlockDef } from "@/lib/pageBlocks";
import BlockIcon, { iconKeyFor } from "@/components/pageEditor/blockIcons";

export const CATEGORY_ORDER: BlockCategory[] = ["Headers", "Content", "Media", "Calls to action", "Forms", "Layout", "Custom design", "Live content", "Business"];

/** A grid of block types grouped by category, used both for the top-level
 * "Add section" fallback and for adding an element inside a row's column
 * (which passes a `defs` list already filtered to `nestable: true`). */
export default function BlockTypePicker({
  title,
  defs,
  onPick,
  onClose,
}: {
  title: string;
  defs: BlockDef[];
  onPick: (type: string) => void;
  onClose: () => void;
}) {
  return (
    <ConsoleModal title={title} onClose={onClose} wide>
      <div className="space-y-6">
        {CATEGORY_ORDER.map((category) => {
          const items = defs.filter((d) => d.category === category);
          if (!items.length) return null;
          return (
            <div key={category}>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{category}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 min-[440px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {items.map((def) => (
                  <button
                    key={def.type}
                    type="button"
                    onClick={() => onPick(def.type)}
                    title={blockSummary(def)}
                    className="group flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-paper px-2 py-3 text-center transition-colors hover:border-ink hover:bg-paper-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  >
                    <BlockIcon type={iconKeyFor(def.type)} className="h-5 w-5 text-ink-soft transition-colors group-hover:text-ink" />
                    <span className="text-[11px] font-medium leading-tight text-ink">{def.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ConsoleModal>
  );
}
