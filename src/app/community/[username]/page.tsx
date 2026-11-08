import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getProfileByUsername, getProfileStats, isModeratorOrAdmin, getInviteStats } from "@/lib/community";
import { getLevelInfo } from "@/lib/gamification";
import LevelBadge from "@/components/community/LevelBadge";
import InviteButton from "@/components/community/InviteButton";
import { pool } from "@/lib/db";
import { getPublicPosts } from "@/lib/blogPosts";
import ProfileTabs from "@/components/community/ProfileTabs";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME, SITE_URL, OG_LOCALE } from "@/config/brand";
import { defaultAuthorSlug } from "@/data/authors";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) return { title: "Member" };
  const name = profile.name || profile.username || "Community member";
  const description = profile.bio || `${name}'s public ${SITE_NAME} community profile.`;
  return {
    title: name,
    description,
    alternates: { canonical: `/community/${profile.username}` },
    openGraph: {
      type: "profile",
      title: name,
      description,
      url: `/community/${profile.username}`,
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      ...(profile.avatar_url ? { images: [{ url: profile.avatar_url, alt: name }] } : {}),
    },
  };
}

const SOCIAL_LABELS: Record<string, string> = {
  twitter: "Twitter/X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  youtube: "YouTube",
  website: "Website",
};

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const [stats, viewerSession] = await Promise.all([
    getProfileStats(profile.id),
    getSession(),
  ]);
  const socialEntries = Object.entries(profile.social_links || {}).filter(([, v]) => v);
  const adminEmail = process.env.ADMIN_EMAIL;
  const isSiteOwner = !!adminEmail && profile.email === adminEmail;

  const isOwnProfile = viewerSession?.userId === profile.id;
  const viewerIsMod = isOwnProfile ? await isModeratorOrAdmin(viewerSession!.userId) : false;
  const inviteStats = isOwnProfile ? await getInviteStats(profile.id) : null;
  const levelInfo = getLevelInfo(profile.community_points);

  // Both of these only ever feed the site owner's own profile, but the blog
  // index used to be loaded on every profile view, owner or not -- an extra
  // connection and query for a list that was then thrown away. Sentry's N+1
  // detector picked this page up (IM-WEBSITE-9) off a crawler walking member
  // profiles, which is exactly the traffic that pays for it.
  const [postsIndex, createdCourses] = isSiteOwner
    ? await Promise.all([
        getPublicPosts(),
        pool
          .query("SELECT slug, title FROM courses WHERE published = true ORDER BY created_at DESC")
          .then((result) => result.rows),
      ])
    : [[], []];
  const recentPosts = postsIndex.slice(0, 10);

  const communityTab = (
    <div className="space-y-6">
      <div className="flex gap-6 text-sm">
        <div>
          <p className="font-display text-lg font-semibold">{stats.postCount}</p>
          <p className="text-xs text-ink-soft">posts</p>
        </div>
        <div>
          <p className="font-display text-lg font-semibold">{stats.commentCount}</p>
          <p className="text-xs text-ink-soft">comments</p>
        </div>
        <div>
          <p className="font-display text-lg font-semibold">{profile.community_points}</p>
          <p className="text-xs text-ink-soft">community points</p>
        </div>
      </div>
      {viewerIsMod && (
        <Link href="/community/admin" className="text-sm font-medium underline hover:text-ink">
          Community admin
        </Link>
      )}
    </div>
  );

  const coursesTab = (
    <div className="space-y-6">
      {createdCourses.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Created</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {createdCourses.map((c) => (
              <Link
                key={c.slug}
                href={`/courses/${c.slug}`}
                className="rounded-full border border-line px-3 py-1 text-xs transition-colors hover:border-ink"
              >
                {c.title}
              </Link>
            ))}
          </div>
        </div>
      )}
      {stats.courses.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Enrolled in</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {stats.courses.map((c) => (
              <Link
                key={c.slug}
                href={`/courses/${c.slug}`}
                className="rounded-full border border-line px-3 py-1 text-xs transition-colors hover:border-ink"
              >
                {c.title} · {c.tier === "pro" ? "PRO" : "Free"}
              </Link>
            ))}
          </div>
        </div>
      )}
      {createdCourses.length === 0 && stats.courses.length === 0 && (
        <p className="text-sm text-ink-soft">No courses yet.</p>
      )}
    </div>
  );

  const blogTab = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-soft">{postsIndex.length} posts total</p>
        <Link href={`/author/${defaultAuthorSlug}`} className="text-xs font-medium underline hover:text-ink">
          See all
        </Link>
      </div>
      {recentPosts.map((p) => (
        <Link
          key={p.slug}
          href={`/blog/${p.slug}`}
          className="block rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-ink"
        >
          {p.title}
        </Link>
      ))}
    </div>
  );

  const tabs = [
    { key: "community", label: "Community", content: communityTab },
    { key: "courses", label: "Courses", content: coursesTab },
    ...(isSiteOwner ? [{ key: "blog", label: "Blog", content: blogTab }] : []),
  ];
  const profileUrl = `${SITE_URL}/community/${profile.username}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${profileUrl}#profile`,
    url: profileUrl,
    dateCreated: profile.created_at,
    mainEntity: {
      "@type": "Person",
      "@id": `${profileUrl}#person`,
      name: profile.name || profile.username || "Community member",
      alternateName: profile.username ? `@${profile.username}` : undefined,
      url: profileUrl,
      description: profile.bio || undefined,
      image: profile.avatar_url || undefined,
      sameAs: socialEntries.map(([, url]) => url),
      agentInteractionStatistic: [
        { "@type": "InteractionCounter", interactionType: "https://schema.org/WriteAction", userInteractionCount: stats.postCount },
        { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: stats.commentCount },
      ],
    },
  };

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="flex items-center gap-4">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt={`${profile.name || profile.username}'s avatar`} className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-paper-soft" />
        )}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-semibold">{profile.name || profile.username}</h1>
            <LevelBadge points={profile.community_points} size="md" />
            {isSiteOwner && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">Admin</span>
            )}
            {profile.role === "moderator" && !isSiteOwner && (
              <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-paper">Moderator</span>
            )}
            {stats.hasProAccess && (
              <span className="rounded-full border border-line px-2 py-0.5 text-xs font-medium">PRO member</span>
            )}
          </div>
          <p className="text-sm text-ink-soft">@{profile.username}</p>
        </div>
      </div>
      
      {!isOwnProfile && viewerSession && (
        <div className="mt-4">
          <Link
            href={`/community/messages/${profile.username}`}
            className="inline-block rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            Message {profile.name?.split(" ")[0] || profile.username}
          </Link>
        </div>
      )}

      {/* Level & Points Progress */}
      <div className="mt-6 rounded-2xl border border-line bg-paper p-5">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">Level {levelInfo.level}</span>
            <span className="text-ink-soft">({levelInfo.name})</span>
          </div>
          <span className="font-mono font-medium text-ink-soft">
            {profile.community_points} {levelInfo.nextLevelPoints ? `/ ${levelInfo.nextLevelPoints} pts` : "pts (MAX)"}
          </span>
        </div>
        {levelInfo.nextLevelPoints && (
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-paper-soft border border-line">
            <div
              className="h-full bg-ink rounded-full transition-all duration-500"
              style={{ width: `${levelInfo.progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Invite Friends Card for Account Owner */}
      {isOwnProfile && (
        <div className="mt-4 rounded-2xl border border-line bg-paper-soft p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-semibold text-ink text-sm">Invite Friends & Earn Points</h3>
              <p className="text-xs text-ink-soft mt-0.5">
                {inviteStats?.invitedCount ?? 0} members invited • +{inviteStats?.pointsEarned ?? 0} pts earned (+10 pts per invite)
              </p>
            </div>
            <InviteButton
              username={profile.username}
              isLoggedIn={true}
              className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-85 whitespace-nowrap"
            />
          </div>
        </div>
      )}

      {isSiteOwner && (
        <p className="mt-6 text-sm text-ink-soft">
          Founder of {SITE_NAME}, blog author, and course creator ({profile.email}).
        </p>
      )}

      {profile.bio && <p className="mt-6 text-sm leading-6">{profile.bio}</p>}

      {socialEntries.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-3">
          {socialEntries.map(([key, url]) => (
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-line px-4 py-1.5 text-sm transition-colors hover:border-ink"
            >
              {SOCIAL_LABELS[key] || key}
            </a>
          ))}
        </div>
      )}

      <ProfileTabs tabs={tabs} />
    </div>
  );
}
