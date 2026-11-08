import type { Metadata } from "next";
import SafeImage from "@/components/SafeImage";
import { notFound } from "next/navigation";
import { getLeadMagnetBySlug } from "@/lib/leadMagnets";
import GuidePopup from "@/components/GuidePopup";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getLeadMagnetBySlug(slug);
  if (!guide) return {};
  return { title: guide.title, description: guide.headline };
}

/** Doubles as both the guide's shareable landing page and the destination
 * the magic-link verification redirects to. `?unlocked=1` on the URL is
 * not a secret token -- by the time someone has it, they've already
 * proven ownership of the email by clicking that link, which is the
 * actual gate (see completeGuideVerification in src/lib/otpCompletion.ts).
 * The flag only decides whether to show the download button or the
 * request form. */
export default async function GuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ unlocked?: string }>;
}) {
  const { slug } = await params;
  const { unlocked } = await searchParams;
  const guide = await getLeadMagnetBySlug(slug);
  if (!guide || !guide.published) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      {guide.cover_image_url && (
        <div className="flex justify-center rounded-3xl border border-line bg-paper-soft p-6 sm:p-10">
          <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl sm:max-w-md">
            <SafeImage
              src={guide.cover_image_url}
              alt={`${guide.title} 3D book cover`}
              fill
              sizes="(min-width: 768px) 448px, 90vw"
              className="object-contain"
              priority
            />
          </div>
        </div>
      )}

      <h1 className="mt-8 text-balance font-display text-3xl font-semibold sm:text-4xl">{guide.title}</h1>
      <p className="mt-4 max-w-xl text-lg text-ink-soft">{guide.headline}</p>
      {guide.subheadline && <p className="mt-2 max-w-xl text-ink-soft">{guide.subheadline}</p>}

      {unlocked === "1" && guide.file_url ? (
        <div className="mt-8 rounded-2xl border border-ink/15 bg-paper-soft p-6">
          <p className="font-display text-lg font-semibold">You&apos;re verified. Here&apos;s your guide.</p>
          <p className="mt-1 text-sm text-ink-soft">Download it now, it&apos;s yours to keep.</p>
          <a
            href={guide.file_url}
            download
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            Download the guide
          </a>
        </div>
      ) : (
        <div className="mt-8">
          <GuidePopup
            guide={{
              id: guide.id,
              slug: guide.slug,
              title: guide.title,
              headline: guide.headline,
              subheadline: guide.subheadline,
              coverImageUrl: guide.cover_image_url,
            }}
            buttonLabel="Get the free guide"
            buttonClassName="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          />
        </div>
      )}
    </div>
  );
}
