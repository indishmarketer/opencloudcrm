"use client";

import RichTextEditor from "@/components/RichTextEditor";
import type { InlineEdit } from "@/components/pageBlocks/blockViews";

/** The Text element's editor, rendered on the canvas in the place the text
 * actually appears, instead of in a box in the right-hand sidebar.
 *
 * It lives here rather than in blockViews.tsx on purpose: blockViews is
 * shared with the public site, and importing TipTap there would ship the
 * whole editor to every visitor. The canvas passes the rendered editor down
 * as a node, so the public bundle never sees it. */
export default function InlineRichText({ edit }: { edit: InlineEdit }) {
  return (
    <div
      className="page-inline-richtext"
      // The canvas selects a block on click; clicks inside the editor are
      // for writing, so they must not bubble up and re-select.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <RichTextEditor
        value={edit.value}
        onChange={edit.onChange}
        textOnly
        allowPopupLinks
        imageUploadUrl="/api/console/pages/image-upload"
      />
    </div>
  );
}
