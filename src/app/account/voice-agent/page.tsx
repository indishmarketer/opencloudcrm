import type { Metadata } from "next";
import { redirect } from "next/navigation";
import VoiceAgentCall from "@/components/VoiceAgentCall";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "AI Receptionist Call",
  robots: { index: false, follow: false },
};

export default async function VoiceAgentPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/account/voice-agent");

  return (
    <div className="mx-auto max-w-7xl px-6 py-20">
      <div className="max-w-2xl">
        <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Your voice agent</p>
        <h1 className="mt-3 font-display text-4xl font-semibold">AI receptionist call</h1>
        <p className="mt-4 max-w-2xl text-ink-soft">
          Allow microphone access, start a call, and speak naturally — you can
          interrupt the agent at any time.
        </p>
      </div>

      <div className="mt-10">
        <VoiceAgentCall />
      </div>
    </div>
  );
}
