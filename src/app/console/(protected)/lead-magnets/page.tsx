import ConsoleLeadMagnets from "@/components/ConsoleLeadMagnets";
import { listLeadMagnets } from "@/lib/leadMagnets";

export const dynamic = "force-dynamic";

export default async function ConsoleLeadMagnetsPage() {
  const guides = await listLeadMagnets();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Free guides</h1>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        The lead magnet behind the homepage&apos;s &quot;Get the free guide&quot; button. Only one published guide
        is offered at a time -- the most recently created one. A visitor requests it, confirms their email via a
        one-click link, and lands on the guide&apos;s own page with the download unlocked.
      </p>
      <div className="mt-8">
        <ConsoleLeadMagnets guides={guides} />
      </div>
    </div>
  );
}
