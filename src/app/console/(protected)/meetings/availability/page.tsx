import { getDefaultSchedule } from "@/lib/calcom";
import ConsoleMeetingAvailability from "@/components/ConsoleMeetingAvailability";
import ConsoleMeetingsTabs from "@/components/ConsoleMeetingsTabs";

export default async function ConsoleMeetingAvailabilityPage() {
  let schedule = null;
  let loadError = "";
  try {
    schedule = await getDefaultSchedule();
  } catch (error) {
    console.error("Failed to load Cal.com schedule:", error);
    loadError = "Could not load availability. Check the booking calendar's API key is configured.";
  }

  return (
    <div>
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Meetings</h1>
        <p className="mt-2 text-sm text-ink-soft">When you&apos;re actually bookable. This decides which slots show up on your booking page.</p>
      </div>
      <div className="mt-6"><ConsoleMeetingsTabs /></div>
      {loadError ? (
        <p className="mt-6 text-sm text-red-600">{loadError}</p>
      ) : (
        <ConsoleMeetingAvailability schedule={schedule!} />
      )}
    </div>
  );
}
