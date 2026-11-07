import { redirect } from "next/navigation";
import { getAdminSessionEmail } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import ConsoleFrame from "@/components/ConsoleFrame";
import { pool } from "@/lib/db";
import { FEATURES } from "@/config/features";

// Every WhatsApp console page already renders a full "not connected yet"
// block with zero config -- there's nothing to discover by leaving the
// link visible, so it's hidden entirely rather than leading to a dead
// end. Payments already shows its own live Configured/Not configured
// state inline, so it isn't gated here.
const baseNavGroups = [
  {
    title: "General",
    links: [
      { href: "/console", label: "Overview" },
      { href: "/console/analytics", label: "Analytics & Metrics" },
    ],
  },
  {
    title: "CRM & Audience",
    links: [
      { href: "/console/contacts", label: "Contacts" },
      { href: "/console/support", label: "Support" },
      { href: "/console/community", label: "Community" },
    ],
  },
  {
    title: "Communication",
    links: [
      { href: "/console/workflows", label: "Automation" },
      { href: "/console/email", label: "Email" },
      ...(FEATURES.whatsapp ? [{ href: "/console/whatsapp", label: "WhatsApp" }] : []),
    ],
  },
  {
    title: "Content & Products",
    links: [
      { href: "/console/pages", label: "Pages" },
      { href: "/console/blog", label: "Blog" },
      { href: "/console/media", label: "Media Library" },
      { href: "/console/courses", label: "Courses" },
      { href: "/console/directory", label: "Tools directory" },
      { href: "/console/lead-magnets", label: "Free guides" },
    ],
  },
  {
    title: "Resources",
    links: [{ href: "/console/prompt-library", label: "Prompt & Skill Library" }],
  },
  {
    title: "Growth & Marketing",
    links: [
      { href: "/console/sales", label: "Sales" },
      { href: "/console/meetings", label: "Meetings" },
      { href: "/console/webinars", label: "Webinars" },
      { href: "/console/reviews", label: "Reviews" },
    ],
  },
  {
    title: "Config",
    links: [
      { href: "/console/payments", label: "Payments" },
      { href: "/console/integrations", label: "Integrations" },
      { href: "/console/site-actions", label: "Site actions" },
      { href: "/console/site-settings", label: "Site Settings" },
      { href: "/console/security", label: "Security" },
      { href: "/console/api-tokens", label: "API & MCP access" },
    ],
  },
];

export default async function ProtectedConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const email = await getAdminSessionEmail();
  if (!email) redirect("/console/login");
  const isOwner = isConsoleOwner(email);
  // Unread, not open. The badge answers "is there anything I have not
  // looked at", so it has to go quiet once he has read everything, even
  // while items stay on the list waiting to be dealt with. Counting open
  // items instead would leave a permanent number sitting in the nav, which
  // is the fastest way to teach someone to ignore it.
  const openAlerts = await pool
    .query<{ n: number }>(
      "SELECT count(*)::int AS n FROM system_alerts WHERE resolved_at IS NULL AND viewed_at IS NULL",
    )
    .then((r) => r.rows[0]?.n || 0)
    .catch(() => 0);
  const navGroups = baseNavGroups.map((group) =>
    group.title === "General"
      ? {
          ...group,
          links: [
            ...group.links,
            { href: "/console/attention", label: "Needs attention", badge: openAlerts },
          ],
        }
      : group
  );

  // One focused viewport for post editing; all other console routes retain
  // the normal sidebar, mobile navigation, and page-scrolling layout.
  return <ConsoleFrame groups={navGroups} email={email} isOwner={isOwner}>{children}</ConsoleFrame>;
}
