import { getAdminSessionEmail, consoleMfaRequired } from "@/lib/auth";
import { isConsoleOwner, listConsoleAdmins } from "@/lib/consoleAdmins";
import { getMfaStatus } from "@/lib/consoleMfa";
import ConsoleSecurityPanel from "@/components/ConsoleSecurityPanel";

export default async function ConsoleSecurityPage() {
  const email = (await getAdminSessionEmail()) || "";
  const isOwner = isConsoleOwner(email);
  const own = await getMfaStatus(email);
  const team = isOwner
    ? await Promise.all(
        (await listConsoleAdmins()).map(async (admin) => ({ email: admin.email, enabled: (await getMfaStatus(admin.email)).enabled }))
      )
    : [];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Security</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Console login is an email link plus a code from an authenticator app.
        {!consoleMfaRequired() && " 2-step login is currently switched off (CONSOLE_MFA=off in Coolify)."}
      </p>
      <ConsoleSecurityPanel
        enabled={own.enabled}
        enabledAt={own.enabledAt ? new Date(own.enabledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null}
        recoveryLeft={own.recoveryLeft}
        team={team}
      />
    </div>
  );
}
