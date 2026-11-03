import Link from "next/link";
import { FEATURES } from "@/config/features";

export default function VoiceAgentBanner() {
  if (!FEATURES.voiceAgent) return null;

  return (
    <aside className="my-8 rounded-2xl border border-line bg-paper-soft p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <div className="inline-flex rounded-full border border-line bg-paper px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
            Try Our Voice Agent
          </div>
          <h3 className="font-display text-2xl font-semibold tracking-tight text-ink">
            We built an AI Voice Agent that actually sounds human.
          </h3>
          <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
            No rigid scripts or robotic menus. Set it up in 2 minutes with four simple business details, and test a live conversation directly in your browser. Get 5 minutes free.
          </p>
        </div>
        <div className="shrink-0">
          <Link
            href="/products/voice-agent"
            className="inline-block rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-paper transition hover:bg-ink/85 text-center w-full sm:w-auto"
          >
            Try five minutes free
          </Link>
        </div>
      </div>
    </aside>
  );
}
