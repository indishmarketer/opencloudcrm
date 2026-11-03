import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { getLatestApplicationForUser } from "@/lib/authorApplications";
import AuthorApplicationFlow from "@/components/AuthorApplicationFlow";
import { SITE_NAME } from "@/config/brand";

export const metadata: Metadata = {
  title: "Apply to write",
  description: `Apply to write a guest post for the ${SITE_NAME} blog.`,
};

export default async function ApplyToWritePage() {
  const session = await getSession();
  const application = session ? await getLatestApplicationForUser(session.userId) : null;

  return (
    <div className="mx-auto max-w-xl px-6 py-20">
      <h1 className="font-display text-3xl font-semibold">Write for us</h1>
      <p className="mt-3 text-ink-soft">
        We&apos;re open to guest contributors covering automation, AI agents, and organic growth. Tell us what
        you&apos;d want to write about.
      </p>

      <div className="mt-8">
        {session ? (
          <AuthorApplicationFlow
            application={
              application
                ? {
                    status: application.status,
                    submission_url: application.submission_url,
                    submission_note: application.submission_note,
                    admin_note: application.admin_note,
                    social_links: application.social_links,
                  }
                : null
            }
          />
        ) : (
          <Link
            href={`/login?redirect=${encodeURIComponent("/apply-to-write")}`}
            className="block w-full rounded-xl border border-line bg-paper px-5 py-4 text-center text-sm text-ink-soft transition-colors hover:border-ink"
          >
            Log in to apply
          </Link>
        )}
      </div>
    </div>
  );
}
