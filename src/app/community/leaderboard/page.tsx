import Link from "next/link";
import { getSession } from "@/lib/auth";
import {
  getLeaderboard,
  getProfileById,
  isModeratorOrAdmin,
  getSpaceAbout,
  getMemberCount,
  listTopMembers,
  isBanned,
} from "@/lib/community";
import { getLevelInfo, LEVELS } from "@/lib/gamification";
import Avatar from "@/components/community/Avatar";
import LevelBadge from "@/components/community/LevelBadge";
import SpaceSwitcher from "@/components/community/SpaceSwitcher";
import CommunityHero from "@/components/community/CommunityHero";
import CommunitySidebar from "@/components/community/CommunitySidebar";
import InviteButton from "@/components/community/InviteButton";
import BannedNotice from "@/components/community/BannedNotice";
import { SITE_NAME } from "@/config/brand";

export const metadata = {
  title: "Leaderboard — Community",
  description: `See the top members and contributors in the ${SITE_NAME} community.`,
  alternates: { canonical: "/community/leaderboard" },
};

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period = "all" } = await searchParams;
  const validPeriod = (period === "7d" || period === "30d" || period === "all") ? period : "all";

  const session = await getSession();
  if (session && (await isBanned(session.userId))) return <BannedNotice />;

  const [currentUser, isMod, about, memberCount, topMembers, leaderboard] = await Promise.all([
    session ? getProfileById(session.userId) : Promise.resolve(null),
    session ? isModeratorOrAdmin(session.userId) : Promise.resolve(false),
    getSpaceAbout("general"),
    getMemberCount("general"),
    listTopMembers("general", 5),
    getLeaderboard(validPeriod, 50),
  ]);

  const userLevel = currentUser ? getLevelInfo(currentUser.community_points) : null;
  const userRank = currentUser ? leaderboard.findIndex((m) => m.id === currentUser.id) + 1 : null;

  return (
    <div>
      <CommunityHero
        title="Leaderboard"
        description="Recognizing the builders, contributors, and active members in our community."
      />

      <div className="border-b border-line bg-paper">
        <div className="mx-auto max-w-5xl px-6">
          <SpaceSwitcher active="leaderboard" isModerator={isMod} />
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-6">

            {/* Logged-in User's Level & Progress */}
            {currentUser && userLevel && (
              <div className="rounded-2xl border border-line bg-paper p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar url={currentUser.avatar_url} name={currentUser.name || currentUser.username} size={48} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display text-lg font-semibold text-ink">
                          {currentUser.name || currentUser.username}
                        </span>
                        <LevelBadge points={currentUser.community_points} size="md" />
                      </div>
                      <p className="text-xs text-ink-soft mt-0.5">
                        {userRank ? `Rank #${userRank}` : "Not ranked yet in this period"} · {currentUser.community_points} lifetime points
                      </p>
                    </div>
                  </div>
                  <div>
                    <InviteButton
                      username={currentUser.username}
                      isLoggedIn={true}
                      className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-85"
                    />
                  </div>
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium text-ink">Level {userLevel.level}: {userLevel.name}</span>
                    <span className="text-ink-soft">
                      {currentUser.community_points} {userLevel.nextLevelPoints ? `/ ${userLevel.nextLevelPoints} pts` : "pts"}
                    </span>
                  </div>
                  {userLevel.nextLevelPoints && (
                    <div className="h-2 w-full overflow-hidden rounded-full bg-paper-soft border border-line">
                      <div
                        className="h-full bg-ink rounded-full transition-all duration-300"
                        style={{ width: `${userLevel.progressPercent}%` }}
                      />
                    </div>
                  )}
                  {userLevel.nextLevelPoints && (
                    <p className="mt-2 text-[11px] text-ink-soft">
                      {userLevel.nextLevelPoints - currentUser.community_points} points needed for Level {userLevel.level + 1}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Time Filter Tabs */}
            <div className="flex items-center justify-between">
              <div className="inline-flex rounded-xl bg-paper-soft p-1 border border-line text-xs font-medium">
                <Link
                  href="/community/leaderboard?period=7d"
                  className={`rounded-lg px-3.5 py-1.5 transition-colors ${
                    validPeriod === "7d"
                      ? "bg-paper text-ink font-semibold shadow-xs"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  This Week
                </Link>
                <Link
                  href="/community/leaderboard?period=30d"
                  className={`rounded-lg px-3.5 py-1.5 transition-colors ${
                    validPeriod === "30d"
                      ? "bg-paper text-ink font-semibold shadow-xs"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  This Month
                </Link>
                <Link
                  href="/community/leaderboard?period=all"
                  className={`rounded-lg px-3.5 py-1.5 transition-colors ${
                    validPeriod === "all"
                      ? "bg-paper text-ink font-semibold shadow-xs"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  All Time
                </Link>
              </div>
            </div>

            {/* Clean Rankings List */}
            <div className="rounded-2xl border border-line bg-paper overflow-hidden">
              {leaderboard.length === 0 ? (
                <div className="p-10 text-center text-sm text-ink-soft">
                  No activity recorded for this period yet.
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {leaderboard.map((member, index) => {
                    const rank = index + 1;
                    const isTop3 = rank <= 3;
                    return (
                      <div
                        key={member.id}
                        className={`flex items-center gap-4 px-5 py-4 transition-colors ${
                          isTop3 ? "bg-paper" : "hover:bg-paper-soft"
                        }`}
                      >
                        <div className="w-7 text-center">
                          {rank === 1 ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-paper text-xs font-bold">
                              1
                            </span>
                          ) : rank === 2 ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-ink text-ink text-xs font-bold">
                              2
                            </span>
                          ) : rank === 3 ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-line bg-paper-soft text-ink text-xs font-bold">
                              3
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-ink-soft">
                              {rank}
                            </span>
                          )}
                        </div>

                        <Avatar url={member.avatar_url} name={member.name || member.username} size={36} />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/community/${member.username}`}
                              className="font-medium text-sm text-ink hover:underline truncate"
                            >
                              {member.name || member.username}
                            </Link>
                            <LevelBadge points={member.community_points} size="sm" />
                          </div>
                          {member.bio && (
                            <p className="text-xs text-ink-soft line-clamp-1 mt-0.5">{member.bio}</p>
                          )}
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-semibold text-ink">
                            {member.period_points}{" "}
                            <span className="text-xs font-normal text-ink-soft">
                              {member.period_points === 1 ? "pt" : "pts"}
                            </span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* How to Earn Points Section (Clean Minimalist Editorial Style) */}
            <div className="rounded-2xl border border-line bg-paper p-6">
              <h3 className="font-display text-base font-semibold text-ink">How Points & Levels Work</h3>
              <p className="mt-1 text-xs text-ink-soft">
                Points are earned automatically by participating and helping other members.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-paper-soft p-4">
                  <p className="text-xs font-semibold text-ink">Create a Post</p>
                  <p className="text-xs text-ink-soft mt-1">+3 points for each approved discussion post</p>
                </div>

                <div className="rounded-xl border border-line bg-paper-soft p-4">
                  <p className="text-xs font-semibold text-ink">Write a Comment</p>
                  <p className="text-xs text-ink-soft mt-1">+1 point for each approved reply</p>
                </div>

                <div className="rounded-xl border border-line bg-paper-soft p-4">
                  <p className="text-xs font-semibold text-ink">Receive Likes</p>
                  <p className="text-xs text-ink-soft mt-1">+1 point when members like your post</p>
                </div>

                <div className="rounded-xl border border-line bg-paper-soft p-4">
                  <p className="text-xs font-semibold text-ink">Invite Friends</p>
                  <p className="text-xs text-ink-soft mt-1">+10 points when a referred member joins</p>
                </div>
              </div>

              {/* Levels Overview */}
              <div className="mt-6 border-t border-line pt-5">
                <h4 className="text-xs font-semibold text-ink uppercase tracking-wider mb-3">Levels</h4>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {LEVELS.map((lvl) => (
                    <div key={lvl.level} className="rounded-xl border border-line p-2.5 text-center">
                      <p className="text-xs font-bold text-ink">Level {lvl.level}</p>
                      <p className="text-[11px] text-ink-soft">{lvl.name}</p>
                      <p className="text-[10px] text-ink-soft/70 mt-1">{lvl.minPoints}+ pts</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          <CommunitySidebar
            space="general"
            about={about}
            memberCount={memberCount}
            topMembers={topMembers}
            currentUser={currentUser}
            hideLeaderboard={true}
          />
        </div>
      </div>
    </div>
  );
}
