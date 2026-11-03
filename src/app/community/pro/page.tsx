import { Suspense } from "react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import {
  getCategories,
  listPosts,
  isModeratorOrAdmin,
  getUserProAccess,
  getSpaceAbout,
  getMemberCount,
  listTopMembers,
  getProfileById,
  isBanned,
} from "@/lib/community";
import PostComposer from "@/components/community/PostComposer";
import PostCard from "@/components/community/PostCard";
import CategoryFilterBar from "@/components/community/CategoryFilterBar";
import SpaceSwitcher from "@/components/community/SpaceSwitcher";
import CommunitySidebar from "@/components/community/CommunitySidebar";
import CommunityHero from "@/components/community/CommunityHero";
import BannedNotice from "@/components/community/BannedNotice";

export const metadata = {
  title: "PRO Community",
  robots: { index: false, follow: false },
};

function ProBanner({ isMod, children }: { isMod?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <CommunityHero badge="PRO Community" title="PRO" description="For PRO members: deeper discussions, direct access." />
      <div className="border-b border-line bg-paper">
        <div className="mx-auto max-w-5xl px-6">
          <SpaceSwitcher active="pro" isModerator={isMod} />
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
    </div>
  );
}

export default async function ProCommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const session = await getSession();

  if (!session) {
    return (
      <ProBanner>
        <div className="rounded-xl border border-line bg-paper-soft p-6 text-center">
          <p className="text-sm text-ink-soft">Log in to see if you have PRO access.</p>
          <Link
            href="/login?redirect=/community/pro"
            className="mt-4 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            Log in
          </Link>
        </div>
      </ProBanner>
    );
  }

  if (await isBanned(session.userId)) return <BannedNotice />;

  // Moderators/admins get PRO access regardless of course enrollment -- they
  // need to see and moderate the space even without buying into it.
  const isMod = await isModeratorOrAdmin(session.userId);
  const hasProAccess = isMod || (await getUserProAccess(session.userId));

  if (!hasProAccess) {
    return (
      <ProBanner>
        <div className="rounded-xl border border-line bg-paper-soft p-6 text-center">
          <p className="text-sm text-ink-soft">Get PRO access with any PRO course purchase.</p>
          <Link
            href="/courses"
            className="mt-4 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            Get PRO access
          </Link>
        </div>
      </ProBanner>
    );
  }

  const [categories, about, memberCount, topMembers, currentUser] = await Promise.all([
    getCategories("pro"),
    getSpaceAbout("pro"),
    getMemberCount("pro"),
    listTopMembers("pro", 5),
    getProfileById(session.userId),
  ]);
  const posts = await listPosts("pro", {
    categorySlug: category,
    viewerUserId: session.userId,
    viewerIsModerator: isMod,
  });

  return (
    <ProBanner isMod={isMod}>
      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-4">
          <PostComposer space="pro" categories={categories} />

          <Suspense>
            <CategoryFilterBar space="pro" categories={categories} />
          </Suspense>

          <div className="space-y-3">
            {posts.length === 0 ? (
              <p className="text-sm text-ink-soft">No posts yet. Be the first.</p>
            ) : (
              posts.map((p) => <PostCard key={p.id} post={p} space="pro" />)
            )}
          </div>
        </div>

        <CommunitySidebar
          space="pro"
          about={about}
          memberCount={memberCount}
          topMembers={topMembers}
          currentUser={currentUser}
        />
      </div>
    </ProBanner>
  );
}
