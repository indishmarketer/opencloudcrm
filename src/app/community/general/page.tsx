import { Suspense } from "react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import {
  getCategories,
  listPosts,
  isModeratorOrAdmin,
  getSpaceAbout,
  getMemberCount,
  listTopMembers,
  getProfileById,
  isBanned,
} from "@/lib/community";
import PostComposer from "@/components/community/PostComposer";
import PostCard from "@/components/community/PostCard";
import { serializeJsonLd } from "@/lib/jsonLd";
import CategoryFilterBar from "@/components/community/CategoryFilterBar";
import SpaceSwitcher from "@/components/community/SpaceSwitcher";
import CommunitySidebar from "@/components/community/CommunitySidebar";
import CommunityHero from "@/components/community/CommunityHero";
import BannedNotice from "@/components/community/BannedNotice";
import { SITE_NAME } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";

export const metadata = {
  title: "Community",
  description:
    `Join the ${SITE_NAME} community to ask questions, share wins, get feedback on AI automation projects, and connect with other indie marketers.`,
  alternates: { canonical: "/community/general" },
};

export default async function GeneralCommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const session = await getSession();
  if (session && (await isBanned(session.userId))) return <BannedNotice />;

  const [categories, isMod, about, memberCount, topMembers, currentUser] = await Promise.all([
    getCategories("general"),
    session ? isModeratorOrAdmin(session.userId) : Promise.resolve(false),
    getSpaceAbout("general"),
    getMemberCount("general"),
    listTopMembers("general", 5),
    session ? getProfileById(session.userId) : Promise.resolve(null),
  ]);
  const posts = await listPosts("general", {
    categorySlug: category,
    viewerUserId: session?.userId,
    viewerIsModerator: isMod,
  });
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${SITE_NAME} Community`,
    description: "Public discussions about marketing, automation, AI agents, and independent business.",
    url: `${SITE_URL}/community/general`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: posts.length,
      itemListElement: posts.map((post, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${SITE_URL}/community/general/${post.id}`,
        name: post.title,
      })),
    },
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <CommunityHero
        title="General"
        description="Ask questions, share wins, and meet other members. Anyone can read. Log in to post or comment."
      />

      <div className="border-b border-line bg-paper">
        <div className="mx-auto max-w-5xl px-6">
          <SpaceSwitcher active="general" isModerator={isMod} />
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-4">
            {session ? (
              <PostComposer space="general" categories={categories} />
            ) : (
              <Link
                href="/login?redirect=/community/general"
                className="block w-full rounded-xl border border-line bg-paper px-5 py-4 text-center text-sm text-ink-soft transition-colors hover:border-ink"
              >
                Log in to post
              </Link>
            )}

            <Suspense>
              <CategoryFilterBar space="general" categories={categories} />
            </Suspense>

            <div className="space-y-3">
              {posts.length === 0 ? (
                <p className="text-sm text-ink-soft">No posts yet. Be the first.</p>
              ) : (
                posts.map((p) => <PostCard key={p.id} post={p} space="general" />)
              )}
            </div>
          </div>

          <CommunitySidebar
            space="general"
            about={about}
            memberCount={memberCount}
            topMembers={topMembers}
            currentUser={currentUser}
          />
        </div>
      </div>
    </div>
  );
}
