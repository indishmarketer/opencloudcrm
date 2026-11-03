import { withTransaction } from "@/lib/db";
import type { GuideItemInput } from "@/lib/promptLibrary";

// The step editor now lives inline in the guide's rich-text body (each
// step is a node in the document), so the ordered item list is derived
// from the editor's content on every save and fully replaces whatever was
// there before -- same delete-all-reinsert approach the old standalone
// steps editor used, just invoked from the guide's own save instead of a
// separate "Save steps" action.
//
// This is split out from src/lib/promptLibrary.ts specifically because it
// touches the DB (via withTransaction, which pulls in `pg`) -- promptLibrary.ts
// is also imported by client console components for its pure helpers
// (slugify, SKILL_TEMPLATE, validation), and `pg` cannot be bundled for
// the browser.
export async function replaceGuideItems(guideId: number, items: GuideItemInput[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query("DELETE FROM prompt_guide_items WHERE guide_id = $1", [guideId]);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await client.query(
        `INSERT INTO prompt_guide_items (guide_id, position, item_type, prompt_id, skill_id, timestamp_label, instruction)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          guideId,
          i,
          item.item_type,
          item.item_type === "prompt" ? item.prompt_id : null,
          item.item_type === "skill" ? item.skill_id : null,
          item.timestamp_label || null,
          item.instruction || null,
        ]
      );
    }
  });
}
