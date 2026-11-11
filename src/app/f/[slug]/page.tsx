import { notFound } from "next/navigation";
import { getFormBySlug } from "@/lib/forms";
import SavedForm from "@/components/SavedForm";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const form = await getFormBySlug(slug);
  if (!form) return { title: "Not found" };
  return {
    title: form.heading || form.name,
    description: form.introText || undefined,
    robots: { index: false },
  };
}

/** Standalone public page for a form with a saved slug.
 * Accessible at /f/<slug> -- a shareable link the owner can send directly,
 * independent of any page or popup placement. */
export default async function StandaloneFormPage({ params }: Props) {
  const { slug } = await params;
  const form = await getFormBySlug(slug);
  // The Sign up / Log in form is driven by the auth pages, not by this
  // generic submit path -- its definition API refuses it, so without this
  // guard /f/auth rendered a bare "Could not load this form" instead of a 404.
  if (!form || form.isFixed) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <SavedForm formId={form.id} showHeading />
    </div>
  );
}
