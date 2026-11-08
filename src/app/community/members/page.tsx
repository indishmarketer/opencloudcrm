import Link from "next/link";
import { listMembers } from "@/lib/community";
import Avatar from "@/components/community/Avatar";
import LevelBadge from "@/components/community/LevelBadge";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Members",
  description: `Members of the ${SITE_NAME} community.`,
  alternates: { canonical: "/community/members" },
};

export default async function MembersPage() {
  const members = await listMembers();
  const publicMembers = members.filter((member) => member.username);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${SITE_NAME} Community Members`,
    url: `${SITE_URL}/community/members`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: publicMembers.length,
      itemListElement: publicMembers.map((member, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${SITE_URL}/community/${member.username}`,
        name: member.name || member.username,
      })),
    },
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <Link href="/community/general" className="text-sm text-ink-soft hover:text-ink">
        ← Back to Community
      </Link>
      <h1 className="mt-4 font-display text-3xl font-semibold">Members</h1>
      <p className="mt-2 text-sm text-ink-soft">{members.length} people in the {SITE_NAME} community.</p>

      <div className="mt-8 divide-y divide-line">
        {members.map((m) => {
          const row = (
            <>
              <Avatar url={m.avatar_url} name={m.name || m.username} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.name || m.username || "Member"}</span>
                  <LevelBadge points={m.community_points || 0} size="sm" />
                  {m.role === "moderator" && (
                    <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium text-paper">Mod</span>
                  )}
                  {m.has_pro_access && (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium">PRO</span>
                  )}
                </div>
                {m.username && <p className="text-xs text-ink-soft">@{m.username}</p>}
              </div>
            </>
          );
          return m.username ? (
            <Link key={m.id} href={`/community/${m.username}`} className="flex items-center gap-3 py-4 hover:opacity-80">
              {row}
            </Link>
          ) : (
            <div key={m.id} className="flex items-center gap-3 py-4 text-ink-soft">
              {row}
            </div>
          );
        })}
      </div>
    </div>
  );
}
