"use client";

import SavedForm from "@/components/SavedForm";

/** A Form element in "saved" mode: renders a form created in Console ->
 * Forms inline on the page, instead of the one-off fields of "custom"
 * mode. See blockViews.tsx's FormBlock for the mode dispatch. */
export default function SavedFormBlock({ formId }: { formId: number }) {
  if (!formId) {
    return <p className="text-sm text-ink-soft">Choose a saved form in the panel on the right.</p>;
  }
  return (
    <div className="max-w-2xl">
      <SavedForm formId={formId} />
    </div>
  );
}
