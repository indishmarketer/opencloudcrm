import Link from "next/link";
import type { TopMember, Space, Profile } from "@/lib/community";
import Avatar from "@/components/community/Avatar";
import LevelBadge from "@/components/community/LevelBadge";
import { getLevelInfo } from "@/lib/gamification";
import InviteButton from "@/components/community/InviteButton";
import { SITE_NAME, assetUrl } from "@/config/brand";

export default function CommunitySidebar({
  space,
  about,
  memberCount,
  topMembers,
  currentUser,
  hideLeaderboard = false,
}: {
  space: Space;
  about: string | null;
  memberCount: number;
  topMembers: TopMember[];
  currentUser?: Profile | null;
  hideLeaderboard?: boolean;
}) {
  const userLevel = currentUser ? getLevelInfo(currentUser.community_points) : null;

  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
      {/* Community Banner Card with Clean Rectangular Frame */}
      <div className="overflow-hidden rounded-2xl border border-line bg-paper">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl("brand/og-default.png")}
            alt={`${SITE_NAME} Community`}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-paper-soft border border-line px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-ink-soft">
              {space === "pro" ? "PRO Space" : "Public Space"}
            </span>
            <Link
              href="/community/members"
              className="text-xs text-ink-soft hover:text-ink hover:underline"
            >
              {memberCount.toLocaleString()} {space === "pro" ? "PRO members" : "members"}
            </Link>
          </div>
          <h2 className="mt-3 font-display text-lg font-semibold text-ink">
            {space === "pro" ? `${SITE_NAME} PRO` : `${SITE_NAME} Community`}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {about || "A community for marketers, creators, and builders automating growth and building AI agents."}
          </p>
          <div className="mt-4">
            <InviteButton
              username={currentUser?.username}
              isLoggedIn={!!currentUser}
            />
          </div>
        </div>
      </div>

      {/* Logged-in User's Level & Progress Widget (shown when not on leaderboard page) */}
      {currentUser && userLevel && !hideLeaderboard && (
        <div className="rounded-2xl border border-line bg-paper p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-ink">Your Level</h2>
            <LevelBadge points={currentUser.community_points} size="sm" />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="font-medium text-ink">Level {userLevel.level}: {userLevel.name}</span>
            <span className="text-ink-soft font-medium">
              {currentUser.community_points} {userLevel.nextLevelPoints ? `/ ${userLevel.nextLevelPoints} pts` : "pts"}
            </span>
          </div>
          {userLevel.nextLevelPoints && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper-soft border border-line">
              <div
                className="h-full bg-ink rounded-full transition-all duration-300"
                style={{ width: `${userLevel.progressPercent}%` }}
              />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between text-[11px] text-ink-soft">
            <Link href="/community/leaderboard" className="font-medium text-ink hover:underline">
              View Leaderboard →
            </Link>
            <span>{userLevel.progressPercent}% progress</span>
          </div>
        </div>
      )}

      {/* Top Members / Mini Leaderboard (shown when not on leaderboard page) */}
      {topMembers.length > 0 && !hideLeaderboard && (
        <div className="rounded-2xl border border-line bg-paper p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-ink">Top Members</h2>
            <Link
              href="/community/leaderboard"
              className="text-xs text-ink-soft hover:text-ink hover:underline"
            >
              See all →
            </Link>
          </div>
          <div className="mt-3.5 space-y-3">
            {topMembers.map((m, i) => {
              const row = (
                <>
                  <span className="w-5 shrink-0 text-xs font-semibold text-ink-soft">
                    {i + 1}
                  </span>
                  <Avatar url={m.avatar_url} name={m.name || m.username} size={28} />
                  <span className="flex-1 truncate text-xs font-medium text-ink">{m.name || m.username || "Member"}</span>
                  <span className="shrink-0 text-xs text-ink-soft">
                    {m.activity_count} pts
                  </span>
                </>
              );
              return m.username ? (
                <Link
                  key={m.id}
                  href={`/community/${m.username}`}
                  className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity"
                >
                  {row}
                </Link>
              ) : (
                <div key={m.id} className="flex items-center gap-2 text-sm text-ink-soft">
                  {row}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
