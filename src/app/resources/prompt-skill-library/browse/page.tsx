import type { Metadata } from "next";
import { Suspense } from "react";
import { pool, buildSafe } from "@/lib/db";
import PromptLibraryBrowser from "@/components/PromptLibraryBrowser";
import InlineSignupCta from "@/components/InlineSignupCta";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_URL } from "@/lib/siteMeta";

export const metadata: Metadata = {
  title: "Browse",
  alternates: { canonical: "/resources/prompt-skill-library/browse" },
};

export default async function PromptSkillLibraryBrowsePage() {
  // See the build-phase note on buildSafe (src/lib/db.ts).
  const [categories, prompts, skills, guides] = await buildSafe(
    async () => {
      const [c, p, s, g] = await Promise.all([
        pool.query(`SELECT id, slug, name FROM prompt_categories ORDER BY sort_order ASC`),
        pool.query(
          `SELECT p.slug, p.title, p.description, p.prompt_text, c.slug AS category_slug, c.name AS category_name
       FROM prompts p JOIN prompt_categories c ON c.id = p.category_id
       WHERE p.status = 'published' AND p.show_in_library = true
       ORDER BY p.created_at DESC`
        ),
        pool.query(
          `SELECT s.slug, s.title, s.description, s.skill_markdown, c.slug AS category_slug, c.name AS category_name
       FROM skills s JOIN prompt_categories c ON c.id = s.category_id
       WHERE s.status = 'published' AND s.show_in_library = true
       ORDER BY s.created_at DESC`
        ),
        pool.query(
          `SELECT g.slug, g.title, g.description, g.body, COUNT(i.id)::int AS item_count
       FROM prompt_guides g
       LEFT JOIN prompt_guide_items i ON i.guide_id = g.id
       WHERE g.status = 'published'
       GROUP BY g.id
       ORDER BY g.created_at DESC`
        ),
      ]);
      return [c.rows, p.rows, s.rows, g.rows] as const;
    },
    [[], [], [], []] as const
  );

  const items = [
    ...prompts.map((p) => ({ ...p, type: "prompt" as const })),
    ...skills.map((s) => ({ ...s, type: "skill" as const })),
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Browse the Prompt & Skill Library",
    url: `${SITE_URL}/resources/prompt-skill-library/browse`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: [
        ...prompts.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${SITE_URL}/resources/prompt-skill-library/browse/prompts/${p.slug}`,
          name: p.title,
        })),
        ...skills.map((s, i) => ({
          "@type": "ListItem",
          position: prompts.length + i + 1,
          url: `${SITE_URL}/resources/prompt-skill-library/browse/skills/${s.slug}`,
          name: s.title,
        })),
        ...guides.map((g, i) => ({
          "@type": "ListItem",
          position: prompts.length + skills.length + i + 1,
          url: `${SITE_URL}/resources/prompt-skill-library/guides/${g.slug}`,
          name: g.title,
        })),
      ],
    },
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <h1 className="font-display text-3xl font-semibold">Prompt &amp; Skill Library</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Prompts, skills, and video/post guides, each in their own tab below.
      </p>
      <div className="mt-8">
        <Suspense>
          <PromptLibraryBrowser categories={categories} items={items} guides={guides} />
        </Suspense>
      </div>
      <InlineSignupCta />
    </div>
  );
}
