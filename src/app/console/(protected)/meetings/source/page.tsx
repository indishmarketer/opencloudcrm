import ConsoleMeetingsTabs from "@/components/ConsoleMeetingsTabs";
import ConsoleMeetingSource from "@/components/ConsoleMeetingSource";

export default function ConsoleMeetingSourcePage() {
  return (
    <div>
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Meetings</h1>
        <p className="mt-2 text-sm text-ink-soft">The contact source for everyone who books a meeting, on any meeting type.</p>
      </div>
      <div className="mt-6"><ConsoleMeetingsTabs /></div>
      <div className="mt-6 max-w-xl rounded-2xl border border-line bg-paper p-5">
        <ConsoleMeetingSource />
      </div>
    </div>
  );
}
