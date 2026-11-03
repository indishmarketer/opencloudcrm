import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getProfileById } from "@/lib/community";
import ProfileForm from "@/components/community/ProfileForm";

export const metadata = { title: "Community Settings", robots: { index: false, follow: false } };

export default async function CommunitySettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/community/settings");

  const profile = await getProfileById(session.userId);
  if (!profile) redirect("/community/general");

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <Link href="/account" className="text-sm text-ink-soft hover:text-ink">
        ← Back to account
      </Link>
      <h1 className="mt-4 font-display text-3xl font-semibold">Community Settings</h1>
      <p className="mt-2 text-sm text-ink-soft">
        This profile shows up on your posts and comments across the community.
      </p>
      <div className="mt-8">
        <ProfileForm profile={profile} />
      </div>
    </div>
  );
}
