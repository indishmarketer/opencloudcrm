import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { extractYoutubeId } from "@/lib/youtube";
import { splitGuideBody, hasGuideStepMarkers } from "@/lib/guideBody";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME, SITE_URL } from "@/lib/siteMeta";
import LibraryBackLink from "@/components/LibraryBackLink";
import InlineSignupCta from "@/components/InlineSignupCta";
import ShareButtons from "@/components/ShareButtons";
import GuideStepCard, { type GuideStepCardData } from "@/components/GuideStepCard";

// Guides are the one library item type actually meant to be shared
// externally (dropped into a YouTube description or a post), so this one
// gets an OG image too -- the video's own thumbnail when there is one --
// not just title/description like the plainer prompt/skill pages.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await pool.query(`SELECT title, description, video_url FROM prompt_guides WHERE slug = $1 AND status = 'published'`, [slug]);
  const guide = result.rows[0];
  if (!guide) return { title: "Guide" };
  const youtubeId = guide.video_url ? extractYoutubeId(guide.video_url) : null;
  const image = youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : undefined;
  return {
    title: guide.title,
    description: guide.description || undefined,
    alternates: { canonical: `/resources/prompt-skill-library/guides/${slug}` },
    openGraph: {
      title: guide.title,
      description: guide.description || undefined,
      images: image ? [image] : undefined,
    },
    twitter: image ? { card: "summary_large_image", title: guide.title, description: guide.description || undefined, images: [image] } : undefined,
  };
}

export default async function PromptGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const guideResult = await pool.query(
    `SELECT id, title, description, video_url, body, created_at, updated_at FROM prompt_guides WHERE slug = $1 AND status = 'published'`,
    [slug]
  );
  const guide = guideResult.rows[0];
  if (!guide) notFound();

  const youtubeId = guide.video_url ? extractYoutubeId(guide.video_url) : null;
  const thumbnailUrl = youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : null;
  const pageUrl = `${SITE_URL}/resources/prompt-skill-library/guides/${slug}`;
  const date = new Date(guide.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Steps written through the rich editor live inline in the body itself
  // (see src/lib/guideBody.ts) -- split it into prose/step segments so
  // each step's interactive card (copy button, etc.) renders exactly
  // where the admin placed it. Guides saved before that existed have no
  // markers, so those fall back to the old prompt_guide_items list below.
  const segments = splitGuideBody(guide.body);
  const usesInlineSteps = hasGuideStepMarkers(guide.body);

  const stepRefs = segments.filter((s) => s.type === "step") as Extract<(typeof segments)[number], { type: "step" }>[];
  const promptIds = stepRefs.filter((s) => s.step.itemType === "prompt" && s.step.refId).map((s) => s.step.refId as number);
  const skillIds = stepRefs.filter((s) => s.step.itemType === "skill" && s.step.refId).map((s) => s.step.refId as number);

  const [promptRows, skillRows, legacyItemsResult] = await Promise.all([
    promptIds.length
      ? pool.query(
          `SELECT p.id, p.slug, p.title, p.prompt_text AS text, c.name AS category_name
           FROM prompts p JOIN prompt_categories c ON c.id = p.category_id
           WHERE p.id = ANY($1) AND p.status = 'published'`,
          [promptIds]
        )
      : Promise.resolve({ rows: [] as { id: number; slug: string; title: string; text: string; category_name: string }[] }),
    skillIds.length
      ? pool.query(
          `SELECT s.id, s.slug, s.title, s.skill_markdown AS text, c.name AS category_name
           FROM skills s JOIN prompt_categories c ON c.id = s.category_id
           WHERE s.id = ANY($1) AND s.status = 'published'`,
          [skillIds]
        )
      : Promise.resolve({ rows: [] as { id: number; slug: string; title: string; text: string; category_name: string }[] }),
    usesInlineSteps
      ? Promise.resolve({ rows: [] })
      : pool.query(
          `SELECT gi.position, gi.item_type, gi.timestamp_label, gi.instruction,
                  COALESCE(p.slug, s.slug) AS item_slug,
                  COALESCE(p.title, s.title) AS item_title,
                  COALESCE(p.prompt_text, s.skill_markdown) AS item_text,
                  COALESCE(pc.name, sc.name) AS category_name
           FROM prompt_guide_items gi
           LEFT JOIN prompts p ON p.id = gi.prompt_id AND p.status = 'published'
           LEFT JOIN prompt_categories pc ON pc.id = p.category_id
           LEFT JOIN skills s ON s.id = gi.skill_id AND s.status = 'published'
           LEFT JOIN prompt_categories sc ON sc.id = s.category_id
           WHERE gi.guide_id = $1 AND COALESCE(p.id, s.id) IS NOT NULL
           ORDER BY gi.position ASC`,
          [guide.id]
        ),
  ]);

  const promptMap = new Map(promptRows.rows.map((r) => [r.id, r]));
  const skillMap = new Map(skillRows.rows.map((r) => [r.id, r]));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: guide.title,
    description: guide.description || undefined,
    image: thumbnailUrl || undefined,
    datePublished: guide.created_at,
    dateModified: guide.updated_at || guide.created_at,
    author: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    mainEntityOfPage: pageUrl,
  };

  const videoJsonLd = youtubeId
    ? {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: guide.title,
        description: guide.description || guide.title,
        thumbnailUrl: [thumbnailUrl],
        uploadDate: guide.created_at,
        embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
      }
    : null;

  const numberedSegments = segments.reduce<{ segment: (typeof segments)[number]; stepIndex: number }[]>((acc, segment) => {
    const prevIndex = acc.length ? acc[acc.length - 1].stepIndex : 0;
    const stepIndex = segment.type === "step" ? prevIndex + 1 : prevIndex;
    return [...acc, { segment, stepIndex }];
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      {videoJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(videoJsonLd) }} />
      )}

      <LibraryBackLink fallbackHref="/resources/prompt-skill-library/browse" label="← Back to the library" />
      <h1 className="mt-4 font-display text-3xl font-semibold leading-tight sm:text-4xl">{guide.title}</h1>
      {guide.description && <p className="mt-4 text-lg text-ink-soft">{guide.description}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-ink-soft">{date}</p>
        <ShareButtons title={guide.title} url={pageUrl} />
      </div>

      {youtubeId && (
        <div className="relative mt-8 aspect-video w-full overflow-hidden rounded-2xl">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}`}
            title={guide.title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      <div className="mt-8 space-y-6">
        {numberedSegments.map(({ segment, stepIndex }, i) => {
          if (segment.type === "html") {
            return (
              <div
                key={i}
                className="prose prose-neutral max-w-none prose-headings:font-display prose-a:text-ink prose-a:underline"
                dangerouslySetInnerHTML={{ __html: segment.html }}
              />
            );
          }
          const { itemType, refId, timestampLabel, instruction } = segment.step;
          const record = refId ? (itemType === "prompt" ? promptMap.get(refId) : skillMap.get(refId)) : undefined;
          if (!record) return null;
          const step: GuideStepCardData = {
            index: stepIndex,
            itemType,
            slug: record.slug,
            title: record.title,
            text: record.text,
            categoryName: record.category_name,
            timestampLabel: timestampLabel || null,
            instruction: instruction || null,
          };
          return (
            <div key={i}>
              <GuideStepCard step={step} />
              <InlineSignupCta />
            </div>
          );
        })}
      </div>

      {!usesInlineSteps && legacyItemsResult.rows.length > 0 && (
        <div className="mt-10 space-y-6">
          <h2 className="font-display text-xl font-semibold">Step by step</h2>
          {legacyItemsResult.rows.map((item, index) => (
            <div key={`${item.item_type}-${item.item_slug}`}>
              <GuideStepCard
                step={{
                  index: index + 1,
                  itemType: item.item_type,
                  slug: item.item_slug,
                  title: item.item_title,
                  text: item.item_text,
                  categoryName: item.category_name,
                  timestampLabel: item.timestamp_label,
                  instruction: item.instruction,
                }}
              />
              <InlineSignupCta />
            </div>
          ))}
        </div>
      )}

      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
        <p className="text-sm text-ink-soft">Found this useful?</p>
        <ShareButtons title={guide.title} url={pageUrl} />
      </div>
    </div>
  );
}
