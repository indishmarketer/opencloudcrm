import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import CopyTextButton from "@/components/CopyTextButton";
import DownloadSkillButton from "@/components/DownloadSkillButton";
import LibraryBackLink from "@/components/LibraryBackLink";
import InlineSignupCta from "@/components/InlineSignupCta";
import { serializeJsonLd } from "@/lib/jsonLd";
import { getDefaultAuthorView } from "@/lib/blogAuthors";
import { SITE_NAME, SITE_URL } from "@/lib/siteMeta";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await pool.query(`SELECT title, description FROM skills WHERE slug = $1 AND status = 'published' AND show_in_library = true`, [slug]);
  const skill = result.rows[0];
  if (!skill) return { title: "Skill" };
  return {
    title: skill.title,
    description: skill.description || undefined,
    alternates: { canonical: `/resources/prompt-skill-library/browse/skills/${slug}` },
    openGraph: { title: skill.title, description: skill.description || undefined },
  };
}

export default async function SkillDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const result = await pool.query(
    `SELECT s.title, s.description, s.skill_markdown, s.created_at, s.updated_at, c.slug AS category_slug, c.name AS category_name
     FROM skills s JOIN prompt_categories c ON c.id = s.category_id
     WHERE s.slug = $1 AND s.status = 'published' AND s.show_in_library = true`,
    [slug]
  );
  const skill = result.rows[0];
  if (!skill) notFound();

  const author = await getDefaultAuthorView();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: skill.title,
    description: skill.description || undefined,
    articleBody: skill.skill_markdown,
    about: skill.category_name,
    isAccessibleForFree: true,
    inLanguage: "en",
    datePublished: skill.created_at,
    dateModified: skill.updated_at || skill.created_at,
    url: `${SITE_URL}/resources/prompt-skill-library/browse/skills/${slug}`,
    author: { "@type": "Person", name: author.name, url: `${SITE_URL}/author/${author.slug}` },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <LibraryBackLink fallbackHref="/resources/prompt-skill-library/browse" label="← Back to the library" />
      <div className="mt-4 flex items-center gap-2">
        <span className="w-fit rounded-full bg-paper-soft px-2.5 py-1 text-xs font-medium text-ink-soft">
          {skill.category_name}
        </span>
        <span className="w-fit rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-paper">Skill</span>
      </div>
      <h1 className="mt-3 font-display text-3xl font-semibold">{skill.title}</h1>
      {skill.description && <p className="mt-3 text-ink-soft">{skill.description}</p>}

      <div className="mt-8 rounded-2xl border border-line bg-paper-soft p-6">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6">{skill.skill_markdown}</pre>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <CopyTextButton text={skill.skill_markdown} label="Copy skill" />
        <DownloadSkillButton text={skill.skill_markdown} filename={`${slug}.md`} />
      </div>
      <InlineSignupCta />
    </div>
  );
}
