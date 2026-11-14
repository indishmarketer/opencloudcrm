import { normalizeEmailBlocks, type EmailBlock } from "@/lib/emailBlocks";
import { renderEmailBlocksToHtml } from "@/lib/emailBlocksRender";

/** A missing or null block layout means the supplied HTML is authoritative.
 * An array, including an empty one, explicitly saves the visual layout. */
export function resolveEmailBodySave(input: { bodyHtml: string; blocks?: unknown }): {
  bodyHtml: string;
  blocks: EmailBlock[] | null;
} {
  if (!Array.isArray(input.blocks)) return { bodyHtml: input.bodyHtml, blocks: null };
  const blocks = normalizeEmailBlocks(input.blocks);
  return { bodyHtml: renderEmailBlocksToHtml(blocks), blocks };
}
