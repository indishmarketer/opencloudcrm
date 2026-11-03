import { redirect } from "next/navigation";
import { getAdminSessionEmail } from "@/lib/auth";
import { isConsoleOwner, listConsoleAdmins } from "@/lib/consoleAdmins";
import ConsoleAdminManager from "@/components/ConsoleAdminManager";

export const metadata = { title: "Team", robots: { index: false, follow: false } };

export default async function ConsoleTeamPage() {
  const email = await getAdminSessionEmail();
  if (!email || !isConsoleOwner(email)) redirect("/console");

  const admins = await listConsoleAdmins();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Team</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Invite people to log in to this console via magic link. Removing someone revokes access immediately, even
        mid-session.
      </p>
      <div className="mt-8">
        <ConsoleAdminManager admins={admins} ownerEmail={email} />
      </div>
    </div>
  );
}
