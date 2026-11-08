import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedToolBySlug, listPublishedTools } from "@/lib/directory";
import DirectoryToolCard from "@/components/DirectoryToolCard";
import RelatedBlogPosts from "@/components/RelatedBlogPosts";
import SubmitToolCta from "@/components/SubmitToolCta";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME, OG_LOCALE } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { metaFromDescription, parseDescription, screenshotAlt } from "@/lib/directoryFields";
import PageBlocks from "@/components/pageBlocks/PageBlocks";
import { getPublishedEntityBlocks, getPublishedPage } from "@/lib/sitePages";

export const revalidate = 300;

const PRICING_LABELS: Record<string, string> = {
  free: "Free",
  freemium: "Freemium",
  paid: "Paid",
  free_api: "Free API",
  paid_api: "Paid API",
};

function isGithubLink(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "github.com";
  } catch {
    return false;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = await getPublishedToolBySlug(slug);
  if (!tool) return {};
  const canonicalPath = `/tools/${tool.category_slug}/${tool.slug}`;
  const description = metaFromDescription(tool.description) || tool.tagline || `${tool.name} in our tools directory.`;
  return {
    title: tool.name,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: tool.name,
      description,
      url: canonicalPath,
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      ...(tool.logo_url ? { images: [{ url: tool.logo_url, alt: tool.name }] } : {}),
    },
  };
}

export default async function DirectoryToolPage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  if (!(await getPublishedPage("/tools"))) notFound();
  const { category: categorySlug, slug } = await params;
  const tool = await getPublishedToolBySlug(slug);
  if (!tool || tool.category_slug !== categorySlug) notFound();

  const related = (await listPublishedTools({ category: categorySlug })).filter((t) => t.slug !== slug).slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.name,
    description: tool.tagline || metaFromDescription(tool.description) || undefined,
    applicationCategory: tool.category_name,
    // Every tool in the directory is a web app, so this is always true, and
    // it's what makes the listing valid: Google's SoftwareApplication rich
    // result requires at least two of offers/aggregateRating/
    // applicationCategory/operatingSystem, and most tools here only had
    // applicationCategory (paid/freemium ones had no offers), one short.
    operatingSystem: "Web",
    url: `${SITE_URL}/tools/${tool.category_slug}/${tool.slug}`,
    sameAs: tool.website_url,
    image: tool.logo_url || undefined,
    ...(tool.pricing_type === "free" || tool.pricing_type === "free_api"
      ? { offers: { "@type": "Offer", price: 0, priceCurrency: "USD" } }
      : {}),
  };

  const extraSections = await getPublishedEntityBlocks("tool", tool.id);
  return (
    <>
    <div className="mx-auto max-w-5xl px-6 py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      <p className="text-sm text-ink-soft">
        <Link href="/tools" className="hover:text-ink">
          Tools Directory
        </Link>{" "}
        /{" "}
        <Link href={`/tools/${tool.category_slug}`} className="hover:text-ink">
          {tool.category_name}
        </Link>
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="rounded-3xl bg-ink p-6 text-paper sm:p-8">
          <div className="flex items-start gap-4">
            {tool.logo_url ? (
              <SafeImage
                src={tool.logo_url}
                alt={`${tool.name} logo`}
                width={72}
                height={72}
                className="h-16 w-16 shrink-0 rounded-2xl border border-paper/20 bg-paper object-contain p-1 sm:h-[72px] sm:w-[72px]"
              />
            ) : (
              <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-paper/30 font-display text-2xl font-semibold sm:h-[72px] sm:w-[72px]">
                {tool.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-paper/70">Software listing</p>
              <h1 className="mt-1 break-words font-display text-3xl font-semibold sm:text-4xl">{tool.name}</h1>
              {tool.tagline && <p className="mt-2 max-w-2xl leading-6 text-paper/80">{tool.tagline}</p>}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full border border-paper/30 px-3 py-1.5 text-xs font-medium">{PRICING_LABELS[tool.pricing_type] || tool.pricing_type}</span>
            <Link href={`/tools/${tool.category_slug}`} className="rounded-full border border-paper/30 px-3 py-1.5 text-xs hover:bg-paper hover:text-ink">
              {tool.category_name}
            </Link>
            {tool.subcategory && (
              <Link href={`/tools/${tool.category_slug}?subcategory=${encodeURIComponent(tool.subcategory)}`} className="rounded-full border border-paper/30 px-3 py-1.5 text-xs hover:bg-paper hover:text-ink">
                {tool.subcategory}
              </Link>
            )}
          </div>
        </section>

        {/* Two stacked panels in the one sidebar column: where to go, then
            how to get listed here yourself. The submit call to action is on
            every tool page by the owner's instruction -- somebody reading a
            competitor's listing is exactly who it is for. */}
        <div className="flex flex-col gap-4">
          <aside className="flex flex-col rounded-3xl border border-line p-5 sm:p-6">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-soft">Visit the product</p>
            <p className="mt-3 break-all text-sm leading-6 text-ink-soft">{tool.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</p>
            {/* Directory links remain nofollow by the owner's decision. */}
            <a
              href={tool.website_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-4 rounded-full bg-ink px-5 py-3 text-center text-sm font-medium text-paper transition-opacity hover:opacity-80"
            >
              {isGithubLink(tool.website_url) ? "View on GitHub" : "Visit website"}
            </a>
          </aside>
          <SubmitToolCta />
        </div>
      </div>

      {tool.description && (
        <section className="mt-8 rounded-3xl border border-line p-6 sm:p-8">
          <h2 className="font-display text-xl font-semibold">About {tool.name}</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-ink-soft">
          {parseDescription(tool.description).map((block, i) =>
            block.type === "heading" ? (
              <h2 key={i} className="pt-4 font-display text-xl font-semibold text-ink">
                {block.text}
              </h2>
            ) : block.type === "list" ? (
              <ul key={i} className="list-disc space-y-1.5 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            ) : (
              <p key={i}>{block.text}</p>
            )
          )}
          </div>
        </section>
      )}

      {tool.screenshots.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">Screenshots</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {tool.screenshots.map((s, i) => (
            <div key={s} className="relative aspect-video overflow-hidden rounded-2xl border border-line bg-paper-soft">
              <SafeImage src={s} alt={screenshotAlt(tool.name, s, tool.screenshot_alts, i)} fill sizes="(min-width: 640px) 384px, 100vw" className="object-cover object-top" />
            </div>
          ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <div className="mt-16">
          <h2 className="font-display text-xl font-semibold">More in {tool.category_name}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {related.map((t) => (
              <DirectoryToolCard key={t.slug} tool={t} />
            ))}
          </div>
        </div>
      )}

      <RelatedBlogPosts tool={tool} />

      <SubmitToolCta variant="wide" className="mt-16" />
    </div>
      {/* Extra sections added from the console (page builder). */}
      {extraSections.length > 0 && <PageBlocks blocks={extraSections} />}
    </>
  );
}
