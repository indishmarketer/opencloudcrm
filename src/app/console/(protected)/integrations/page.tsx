import { pool } from "@/lib/db";
import ConsoleIntegrations from "@/components/ConsoleIntegrations";
import ConsoleWebhooks from "@/components/ConsoleWebhooks";
import ClearInboundWebhookEventsButton from "@/components/ClearInboundWebhookEventsButton";
import Link from "next/link";
import { SITE_URL } from "@/config/brand";

const EVENTS_PAGE_SIZE = 20;

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const query = await searchParams;
  const requestedTab = query.tab;
  const tab = requestedTab === "outbound" || requestedTab === "google-business" ? requestedTab : "inbound";
  const requestedPage = Math.max(1, Number(query.page) || 1);

  const [events, eventsCount] = tab === "inbound"
    ? await Promise.all([
        pool.query(
          "SELECT id, slug, payload, received_at FROM webhook_events ORDER BY received_at DESC LIMIT $1 OFFSET $2",
          [EVENTS_PAGE_SIZE, (requestedPage - 1) * EVENTS_PAGE_SIZE],
        ),
        pool.query<{ total: string }>("SELECT count(*) AS total FROM webhook_events"),
      ])
    : [{ rows: [] }, { rows: [{ total: "0" }] }];
  const totalEvents = Number(eventsCount.rows[0]?.total || 0);
  const totalEventPages = Math.max(1, Math.ceil(totalEvents / EVENTS_PAGE_SIZE));
  const eventsPage = Math.min(requestedPage, totalEventPages);
  const inboundConfigured = Boolean(process.env.WEBHOOK_SHARED_SECRET);

  return (
    <div>
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Integrations</h1>
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          Manage both directions in one place: data external tools send into this website and
          signed events this website sends to external tools.
        </p>
      </div>

      <div className="mt-8 flex gap-2 border-b border-line pb-4">
        <Link
          href="/console/integrations?tab=inbound"
          className={`rounded-full px-4 py-2 text-sm font-medium ${tab === "inbound" ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-soft hover:text-ink"}`}
        >
          Inbound webhooks
        </Link>
        <Link
          href="/console/integrations?tab=outbound"
          className={`rounded-full px-4 py-2 text-sm font-medium ${tab === "outbound" ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-soft hover:text-ink"}`}
        >
          Outbound webhooks
        </Link>
        <Link
          href="/console/integrations?tab=google-business"
          className={`rounded-full px-4 py-2 text-sm font-medium ${tab === "google-business" ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-soft hover:text-ink"}`}
        >
          Google Business Profile
        </Link>
      </div>

      {tab === "google-business" ? (
        <div className="mt-8 rounded-2xl border border-line bg-paper p-6">
          <h2 className="font-display text-2xl font-semibold">Google Business Profile</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">Connect the profile owner with OAuth, choose the correct business location, add Google&apos;s official review link, and monitor synchronization health in Reviews.</p>
          <Link href="/console/reviews" className="mt-5 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper">Open Google review settings</Link>
        </div>
      ) : tab === "outbound" ? (
        <div className="mt-8">
          <h2 className="font-display text-2xl font-semibold">Outbound webhooks</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">
            Send selected website events to n8n, Zapier, or your own HTTPS endpoint. Deliveries
            are signed, recorded, retried automatically, and never block the original website action.
          </p>
          <div className="mt-8"><ConsoleWebhooks /></div>
        </div>
      ) : (
        <div className="mt-8 space-y-12">
          <section>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl font-semibold">Inbound webhook receiver</h2>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${inboundConfigured ? "border-ink text-ink" : "border-red-600 text-red-600"}`}>
                {inboundConfigured ? "Configured" : "Secret missing"}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-ink-soft">
              External tools can send JSON into this website at{" "}
              <code className="rounded bg-paper-soft px-1.5 py-0.5">{SITE_URL}/api/webhooks/&lt;source-name&gt;</code>.
              Requests are accepted only when signed with the shared inbound secret; an unsigned POST is rejected.
              A payload with an <code className="rounded bg-paper-soft px-1.5 py-0.5">email</code> field (and
              optionally <code className="rounded bg-paper-soft px-1.5 py-0.5">name</code>) is registered as a
              real contact automatically, tagged with the source name used in the URL -- not only logged below.
            </p>
            <div className="mt-4 rounded-2xl border border-line bg-paper-soft p-5 text-sm">
              <p className="font-medium">Required request</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
                <li><code>Content-Type: application/json</code></li>
                <li><code>X-Webhook-Timestamp</code>: current Unix timestamp in seconds</li>
                <li><code>X-Webhook-Signature</code>: lowercase HMAC-SHA256 of <code>timestamp.rawJsonBody</code> using <code>WEBHOOK_SHARED_SECRET</code></li>
                <li>Maximum body size: 256KB; timestamps older than five minutes are rejected</li>
              </ul>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-xl font-semibold">Recent inbound events</h3>
              <ClearInboundWebhookEventsButton count={totalEvents} />
            </div>
            <div className="mt-4 space-y-3">
              {events.rows.length === 0 && <p className="text-sm text-ink-soft">No inbound events received yet.</p>}
              {events.rows.map((event) => (
                <div key={event.id} className="rounded-2xl border border-line bg-paper p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium">{event.slug}</p>
                    <p className="text-xs text-ink-soft">{new Date(event.received_at).toLocaleString()}</p>
                  </div>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-ink-soft">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
            {totalEventPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-xs text-ink-soft">
                <span>Page {eventsPage} of {totalEventPages} &middot; {totalEvents} total</span>
                <div className="flex gap-2">
                  <Link
                    href={`/console/integrations?tab=inbound&page=${Math.max(1, eventsPage - 1)}`}
                    className={`rounded-full border border-line px-3 py-1.5 font-medium ${eventsPage <= 1 ? "pointer-events-none opacity-40" : "hover:border-ink"}`}
                  >
                    Previous
                  </Link>
                  <Link
                    href={`/console/integrations?tab=inbound&page=${Math.min(totalEventPages, eventsPage + 1)}`}
                    className={`rounded-full border border-line px-3 py-1.5 font-medium ${eventsPage >= totalEventPages ? "pointer-events-none opacity-40" : "hover:border-ink"}`}
                  >
                    Next
                  </Link>
                </div>
              </div>
            )}
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">Connection credentials &amp; notes</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">
              Store write-only API keys or private configuration notes used when connecting external tools.
              These entries do not send or receive anything by themselves.
            </p>
            <div className="mt-6"><ConsoleIntegrations /></div>
          </section>
        </div>
      )}
    </div>
  );
}
