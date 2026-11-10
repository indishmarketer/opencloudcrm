import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import SavedForm from "@/components/SavedForm";
import { getFormBySlug } from "@/lib/forms";
import { getPublicPosts } from "@/lib/blogPosts";
import { buildSafe } from "@/lib/db";
import { resolveImage } from "@/lib/images";
import { SITE_NAME, OG_LOCALE, assetUrl } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { BuiltInPage, builtInPageMetadata } from "@/components/pageBlocks/SitePageView";
import { getPublishedPage } from "@/lib/sitePages";

const OG_IMAGE = assetUrl("newsletter/og-newsletter.png");

// The selected saved form is resolved from the database on each request.
export const dynamic = "force-dynamic";

const baseMetadata: Metadata = {
  title: "Newsletter",
  description: `Get updates from ${SITE_NAME} by email. Free, no spam.`,
  alternates: { canonical: `${SITE_URL}/newsletter` },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/newsletter`,
    siteName: SITE_NAME,
    locale: OG_LOCALE,
    title: `The ${SITE_NAME} Newsletter`,
    description: "Free updates, no spam.",
    images: [{ url: OG_IMAGE, width: 1520, height: 800, alt: `The ${SITE_NAME} newsletter` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `The ${SITE_NAME} Newsletter`,
    description: "Free updates, no spam.",
    images: [OG_IMAGE],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  if (!(await getPublishedPage("/newsletter"))) return {};
  return builtInPageMetadata("/newsletter", baseMetadata);
}

export default async function NewsletterPage() {
  if (!(await getPublishedPage("/newsletter"))) notFound();
  // See the build-phase note on buildSafe (src/lib/db.ts).
  const recentPosts = await buildSafe(async () => (await getPublicPosts()).slice(0, 3), []);
  const newsletterForm = await getFormBySlug("newsletter");
  return (
    <BuiltInPage path="/newsletter">
    <div>
      {/* RECENT ARTICLES */}
      <section className="bg-paper-soft py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Latest from the blog</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-3xl font-semibold">Recent articles</h2>
            <Link
              href="/blog"
              className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
            >
              View all posts →
            </Link>
          </div>
          <p className="mt-3 text-ink-soft">Not ready to subscribe? Check out some of the latest posts from the blog.</p>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {recentPosts.map((post) => {
              const img = resolveImage(post.feature_image);
              return (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-paper"
                >
                  {img && (
                    <div className="relative aspect-[1200/650] w-full overflow-hidden border-b border-line bg-paper-soft">
                      <SafeImage
                        src={img}
                        alt={post.title}
                        fill
                        sizes="(min-width: 768px) 33vw, 100vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-6">
                    <h3 className="font-display text-lg font-semibold leading-snug">{post.title}</h3>
                    <p className="line-clamp-2 text-sm text-ink-soft">{post.excerpt}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="newsletter-signup" className="scroll-mt-24 border-t border-line bg-paper-gradient py-20 text-center">
        <div className="mx-auto max-w-xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Join the newsletter</p>
          <div className="mx-auto mt-8 max-w-md text-left">
            {newsletterForm && <SavedForm formId={newsletterForm.id} />}
          </div>
        </div>
      </section>
    </div>
    </BuiltInPage>
  );
}
