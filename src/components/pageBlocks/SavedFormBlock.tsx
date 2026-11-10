"use client";

import SavedForm from "@/components/SavedForm";
import type { FormDesign } from "@/lib/formsShape";

/** Renders a form created in Console → Forms inside a page section. */
export default function SavedFormBlock({ formId, designOverride }: { formId: number; designOverride?: Partial<FormDesign> }) {
  if (!formId) {
    return <p className="text-sm text-ink-soft">Choose a saved form in the panel on the right.</p>;
  }
  return (
    <div className="max-w-2xl">
      <SavedForm formId={formId} designOverride={designOverride} />
    </div>
  );
}
