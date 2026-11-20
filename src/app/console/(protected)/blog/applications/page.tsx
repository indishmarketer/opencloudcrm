import { listAuthorApplications } from "@/lib/authorApplications";
import AuthorApplicationCard from "@/components/AuthorApplicationCard";

export default async function ConsoleAuthorApplicationsPage() {
  const applications = await listAuthorApplications();

  return (
    <div>
      <p className="text-sm text-ink-soft">
        Public writer applications. Approving emails the applicant a private link where they can submit a draft
        link or document. It does not publish anything or grant account access.
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
