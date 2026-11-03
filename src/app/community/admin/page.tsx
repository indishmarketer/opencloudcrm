import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getCategories,
  isModeratorOrAdmin,
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
import CommunityHero from "@/components/community/CommunityHero";
import SpaceSwitcher from "@/components/community/SpaceSwitcher";

export const metadata = { title: "Community Admin", robots: { index: false, follow: false } };

export default async function CommunityAdminPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login?redirect=/community/admin");
  }
  const isMod = await isModeratorOrAdmin(session.userId);
  if (!isMod) {
    redirect("/community/general");
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const isAdmin = !!adminEmail && session.email === adminEmail;

  const [pendingPosts, pendingComments, bans] = await Promise.all([
    listPendingPosts(),
    listPendingComments(),
    listBans(),
  ]);

  return (
    <div>
      <CommunityHero title="Admin" description="Moderate discussions, manage members, and configure community spaces." />
      <div className="border-b border-line bg-paper">
        <div className="mx-auto max-w-5xl px-6">
          <SpaceSwitcher active="admin" isModerator={true} />
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-display text-3xl font-semibold">Community Admin</h1>
        <p className="mt-2 text-sm text-ink-soft">Moderation queue, banned members, roles, and settings.</p>

        <div className="mt-8 space-y-10">
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

        {isAdmin && <AdminOnlySections />}
      </div>
    </div>
    </div>
  );
}

async function AdminOnlySections() {
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
