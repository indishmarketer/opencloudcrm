"use client";

import SavedForm from "@/components/SavedForm";
import type { FormDesign } from "@/lib/formsShape";

/** Renders a form created in Console → Forms inside a page section. */
export default function SavedFormBlock({
  formId,
  designOverride,
  initialForm,
  preview = false,
}: {
  formId: number;
  designOverride?: Partial<FormDesign>;
  /** Resolved on the server by whichever renderer placed this block, so the
   * form arrives with the page rather than after it. */
  initialForm?: React.ComponentProps<typeof SavedForm>["initialForm"];
  /** Inside the page editor: draw the form, run no bot challenge. */
  preview?: boolean;
}) {
  if (!formId) {
    return <p className="text-sm text-ink-soft">Choose a saved form in the panel on the right.</p>;
  }
  return (
    <div className="max-w-2xl">
      <SavedForm formId={formId} designOverride={designOverride} initialForm={initialForm} preview={preview} />
    </div>
  );
}
