import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { pool } from "@/lib/db";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME, SITE_URL } from "@/config/brand";
import { BuiltInPage, builtInPageMetadata } from "@/components/pageBlocks/SitePageView";
import { isKnownImageHost } from "@/lib/liveImageHost";

export async function generateMetadata(): Promise<Metadata> {
  return builtInPageMetadata("/courses", {
    title: "Courses",
    description: `Courses from ${SITE_NAME}.`,
    alternates: { canonical: "/courses" },
  });
}

export const dynamic = "force-dynamic";

export default async function CoursesIndexPage() {
  const result = await pool.query(
    `SELECT c.slug, c.title, c.subtitle, c.cover_image_url,
       EXISTS(SELECT 1 FROM course_modules m WHERE m.course_id = c.id AND m.tier = 'free') AS has_free,
       EXISTS(SELECT 1 FROM course_modules m WHERE m.course_id = c.id AND m.tier = 'pro') AS has_pro
     FROM courses c WHERE c.published = true ORDER BY c.created_at DESC`
  );
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${SITE_NAME} Courses`,
    description: `Courses from ${SITE_NAME}.`,
    url: `${SITE_URL}/courses`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: result.rows.length,
      itemListElement: result.rows.map((course, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${SITE_URL}/courses/${course.slug}`,
        item: {
          "@type": "Course",
          name: course.title,
          description: course.subtitle || undefined,
          provider: { "@id": `${SITE_URL}/#organization` },
        },
      })),
    },
  };

  return (
    <BuiltInPage path="/courses">
    <div className="mx-auto max-w-6xl px-6 pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        {result.rows.map((c, index) => (
          <Link
            key={c.slug}
            href={`/courses/${c.slug}`}
            className="group overflow-hidden rounded-2xl border border-line bg-paper transition-colors hover:border-ink"
          >
            {c.cover_image_url && (
              <div className="relative aspect-[1200/650] w-full overflow-hidden">
                <Image
                  src={c.cover_image_url}
                  alt={c.title}
                  fill
                  sizes="(min-width: 640px) 50vw, 100vw"
                  preload={index === 0}
                  unoptimized={!isKnownImageHost(c.cover_image_url)}
                  className="object-cover transition-transform group-hover:scale-[1.02]"
                />
              </div>
            )}
            <div className="p-6">
              <h2 className="font-display text-xl font-semibold">{c.title}</h2>
              {c.subtitle && <p className="mt-1 text-sm text-ink-soft">{c.subtitle}</p>}
              <div className="mt-3 flex items-center gap-2">
                {c.has_free && (
                  <span className="inline-block rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink">
                    FREE
                  </span>
                )}
                {c.has_pro && (
                  <span className="inline-block rounded-full border border-red-600 px-3 py-1 text-xs font-semibold text-red-600">
                    PRO
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
        {result.rows.length === 0 && (
          <p className="text-sm text-ink-soft">No courses published yet — check back soon.</p>
        )}
      </div>
    </div>
    </BuiltInPage>
  );
}