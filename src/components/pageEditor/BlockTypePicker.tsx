"use client";

import ConsoleModal from "@/components/ConsoleModal";
import { blockSummary, type BlockDef, type PaletteGroup } from "@/lib/pageBlocks";
import BlockIcon, { iconKeyFor } from "@/components/pageEditor/blockIcons";

/** The real axis the picker groups by -- see PaletteGroup's own doc
 * comment in pageBlocks.ts for why this replaced grouping by the
 * content-topic `category` (Headers/Media/Forms/...), which put a true
 * primitive like Image in the same bucket as a pre-built, multi-piece
 * composite like Featured-on, with nothing in the UI telling them apart. */
export const GROUP_ORDER: { group: PaletteGroup; label: string; hint: string }[] = [
  { group: "element", label: "Elements", hint: "Primitives you build with -- click and style each one yourself." },
  { group: "template", label: "Templates", hint: "Pre-arranged starting points. Drop one, then pull it apart and edit the pieces." },
  { group: "dynamic", label: "Dynamic content", hint: "Pulls real data from elsewhere in your CRM (posts, courses, reviews, your business profile) -- nothing here to decompose, it's live." },
];

/** A grid of block types grouped by Elements / Templates / Dynamic
 * content, used both for the top-level "Add section" fallback and for
 * adding an element inside a row's column (which passes a `defs` list
 * already filtered to `nestable: true` -- in practice always all
 * "element", so its single group header is skipped). */
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
  const groupsPresent = new Set(defs.map((d) => d.group));
  const showGroupHeaders = groupsPresent.size > 1;
  return (
    <ConsoleModal title={title} onClose={onClose} wide>
      <div className="space-y-6">
        {GROUP_ORDER.map(({ group, label, hint }) => {
          const items = defs.filter((d) => d.group === group);
          if (!items.length) return null;
          return (
            <div key={group}>
              {showGroupHeaders && (
                <div className="mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink">{label}</p>
                  <p className="text-[11px] text-ink-soft">{hint}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 min-[440px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
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
