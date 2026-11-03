import Link from "next/link";
import { pool } from "@/lib/db";
import { getAdminSessionEmail } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import {
  getCategories,
  listPendingPosts,
  listPendingComments,
  listBans,
  listModerators,
  listSpaceSettings,
} from "@/lib/community";
import CategoryManager from "@/components/community/CategoryManager";
import ModerationQueue from "@/components/community/ModerationQueue";
import BanManager from "@/components/community/BanManager";
import ModeratorManager from "@/components/community/ModeratorManager";
import SpaceSettingsPanel from "@/components/community/SpaceSettingsPanel";
import MemberUsernameManager from "@/components/community/MemberUsernameManager";

export const metadata = { title: "Community", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** The same moderation tools that used to be reachable only from the public
 * site at /community/admin, inside the console where the rest of the
 * admin work happens. The public page stays for community moderators who
 * are not console admins; the API routes behind both accept either session
 * (src/lib/communityAdminAuth.ts). */
export default async function ConsoleCommunityPage() {
  // The layout above already redirects anyone without a console session;
  // this is only to tell the owner apart from an invited admin.
  const email = (await getAdminSessionEmail()) || "";
  const isOwner = isConsoleOwner(email);

  const [pendingPosts, pendingComments, bans, members] = await Promise.all([
    listPendingPosts(),
    listPendingComments(),
    listBans(),
    pool
      .query<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE username IS NOT NULL")
      .then((r) => r.rows[0]?.n ?? 0)
      .catch(() => 0),
  ]);

  const pendingTotal = pendingPosts.length + pendingComments.length;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Community</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Moderation queue, banned members, roles, and space settings, all without leaving the console.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
          <p className="text-2xl font-semibold sm:text-3xl">{pendingTotal}</p>
          <p className="mt-1 text-sm text-ink-soft">Awaiting moderation</p>
        </div>
        <div className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
          <p className="text-2xl font-semibold sm:text-3xl">{members}</p>
          <p className="mt-1 text-sm text-ink-soft">Members</p>
        </div>
        <div className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
          <p className="text-2xl font-semibold sm:text-3xl">{bans.length}</p>
          <p className="mt-1 text-sm text-ink-soft">Banned</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/community/general"
          className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
        >
          Open General space
        </Link>
        <Link
          href="/community/pro"
          className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
        >
          Open PRO space
        </Link>
      </div>

      <div className="mt-10 space-y-10">
        <section>
          <h2 className="font-display text-lg font-semibold">Pending approval</h2>
          <div className="mt-3">
            <ModerationQueue posts={pendingPosts} comments={pendingComments} />
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">Banned members</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Banning removes community access only (can&apos;t view or post in General/PRO). It does not touch their
            account, courses, or any other access.
          </p>
          <div className="mt-3">
            <BanManager bans={bans} />
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">Rename a member</h2>
          <div className="mt-3">
            <MemberUsernameManager />
          </div>
        </section>

        {isOwner && <OwnerOnlySections />}
      </div>
    </div>
  );
}

async function OwnerOnlySections() {
  const [generalCategories, proCategories, moderators, settings] = await Promise.all([
    getCategories("general"),
    getCategories("pro"),
    listModerators(),
    listSpaceSettings(),
  ]);

  return (
    <>
      <section>
        <h2 className="font-display text-lg font-semibold">Moderators</h2>
        <div className="mt-3">
          <ModeratorManager moderators={moderators} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">Space settings</h2>
        <div className="mt-3">
          <SpaceSettingsPanel settings={settings} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">General categories</h2>
        <div className="mt-3">
          <CategoryManager space="general" categories={generalCategories} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">PRO categories</h2>
        <div className="mt-3">
          <CategoryManager space="pro" categories={proCategories} />
        </div>
      </section>
    </>
  );
}
