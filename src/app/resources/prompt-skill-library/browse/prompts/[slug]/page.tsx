import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import CopyTextButton from "@/components/CopyTextButton";
import LibraryBackLink from "@/components/LibraryBackLink";
import InlineSignupCta from "@/components/InlineSignupCta";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME, SITE_URL } from "@/lib/siteMeta";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await pool.query(`SELECT title, description FROM prompts WHERE slug = $1 AND status = 'published' AND show_in_library = true`, [slug]);
  const prompt = result.rows[0];
  if (!prompt) return { title: "Prompt" };
  return {
    title: prompt.title,
    description: prompt.description || undefined,
    alternates: { canonical: `/resources/prompt-skill-library/browse/prompts/${slug}` },
    openGraph: { title: prompt.title, description: prompt.description || undefined },
  };
}

export default async function PromptDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const result = await pool.query(
    `SELECT p.title, p.description, p.prompt_text, p.created_at, p.updated_at, c.slug AS category_slug, c.name AS category_name
     FROM prompts p JOIN prompt_categories c ON c.id = p.category_id
     WHERE p.slug = $1 AND p.status = 'published' AND p.show_in_library = true`,
    [slug]
  );
  const prompt = result.rows[0];
  if (!prompt) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: prompt.title,
    description: prompt.description || undefined,
    text: prompt.prompt_text,
    about: prompt.category_name,
    genre: "AI prompt",
    isAccessibleForFree: true,
    inLanguage: "en",
    dateCreated: prompt.created_at,
    dateModified: prompt.updated_at || prompt.created_at,
    url: `${SITE_URL}/resources/prompt-skill-library/browse/prompts/${slug}`,
    creator: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <LibraryBackLink fallbackHref="/resources/prompt-skill-library/browse" label="← Back to the library" />
      <div className="mt-4 flex items-center gap-2">
        <span className="w-fit rounded-full bg-paper-soft px-2.5 py-1 text-xs font-medium text-ink-soft">
          {prompt.category_name}
        </span>
        <span className="w-fit rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-paper">Prompt</span>
      </div>
      <h1 className="mt-3 font-display text-3xl font-semibold">{prompt.title}</h1>
      {prompt.description && <p className="mt-3 text-ink-soft">{prompt.description}</p>}

      <div className="mt-8 rounded-2xl border border-line bg-paper-soft p-6">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">{prompt.prompt_text}</pre>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <CopyTextButton text={prompt.prompt_text} label="Copy prompt" />
      </div>
      <InlineSignupCta />
    </div>
  );
}
