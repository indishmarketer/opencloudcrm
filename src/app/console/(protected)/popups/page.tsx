import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { listPopups } from "@/lib/popups";
import ConsolePopups from "@/components/ConsolePopups";
import ConsolePagesTabs from "@/components/ConsolePagesTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Popups | Console" };

export default async function ConsolePopupsPage() {
  if (!(await getAdminSession())) redirect("/console/login");
  const popups = await listPopups();

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink sm:text-3xl">Popups</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Dialogs you design with the same elements as a page — a heading, text, an image, a video, buttons,
          or an embedded form. Open one from any page with a Button (set{" "}
          <span className="whitespace-nowrap">&quot;Button opens&quot;</span> to &quot;A popup&quot;) or a text
          link (set its link to &quot;Open a popup&quot;).
        </p>
      </div>
      <ConsolePagesTabs />
      <ConsolePopups
        popups={popups.map((p) => ({ id: p.id, name: p.name, elements: p.blocks.length, updatedAt: p.updatedAt }))}
      />
    </div>
  );
}
