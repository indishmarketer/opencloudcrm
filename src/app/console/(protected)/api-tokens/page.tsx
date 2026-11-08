import ConsoleApiTokens from "@/components/ConsoleApiTokens";
import { SITE_URL } from "@/lib/liveSiteUrl";

export default function ConsoleApiTokensPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">API &amp; MCP access</h1>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        One place to issue keys for everything this site can do over an API, and to connect an AI
        agent (Claude, or anything else that speaks MCP) to this deployment directly.
      </p>
      <div className="mt-8">
        <ConsoleApiTokens siteUrl={SITE_URL} />
      </div>
    </div>
  );
}
