import { listAuthorApplications } from "@/lib/authorApplications";
import AuthorApplicationCard from "@/components/AuthorApplicationCard";

export default async function ConsoleAuthorApplicationsPage() {
  const applications = await listAuthorApplications();

  return (
    <div>
      <p className="text-sm text-ink-soft">
        Members who want to write for the blog. Approving asks them for a draft link, it doesn&apos;t publish
        anything or grant any access on its own.
      </p>
      <div className="mt-6 space-y-4">
        {applications.length === 0 && <p className="text-sm text-ink-soft">No applications yet.</p>}
        {applications.map((a) => (
          <AuthorApplicationCard key={a.id} application={a} />
        ))}
      </div>
    </div>
  );
}
