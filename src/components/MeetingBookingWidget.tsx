"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import UpdatesOptIn from "@/components/UpdatesOptIn";
import { detectCountry } from "@/components/CountrySelect";
import PhoneInput, { toE164 } from "@/components/PhoneInput";
import { MonthCalendar, toDateKey } from "@/components/MonthCalendar";

// Every modern browser Next.js targets supports Intl.supportedValuesOf --
// no dependency needed for a full, always-current IANA timezone list.
function allTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

export function MeetingBookingWidget({ slug, prefillName, prefillEmail }: { slug: string; prefillName: string; prefillEmail: string }) {
  const router = useRouter();
  const [timezone, setTimezone] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);

  const [name, setName] = useState(prefillName);
  const [email, setEmail] = useState(prefillEmail);
  const [notes, setNotes] = useState("");
  const [updatesOptIn, setUpdatesOptIn] = useState(true);
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const timeZoneOptions = useMemo(() => allTimeZones().map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") })), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setSelectedDate(toDateKey(new Date()));
  }, []);

  // The country is no longer asked for: it is detected from the visitor's
  // network/timezone and used only to prefix the phone field's dial code.
  useEffect(() => {
    let cancelled = false;
    void detectCountry().then((code) => {
      if (!cancelled && code) setCountry(code);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!timezone || !selectedDate) return;

    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingSlots(true);
    setError("");

    // selectedDate is a plain "YYYY-MM-DD" -- parsed without a timezone
    // suffix, `new Date()` treats it as local time in the visitor's own
    // browser, matching the detected/chosen `timezone` value above.
    const dayStart = new Date(`${selectedDate}T00:00:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const url = `/api/meetings/availability?slug=${encodeURIComponent(slug)}&start=${encodeURIComponent(dayStart.toISOString())}&end=${encodeURIComponent(dayEnd.toISOString())}&timezone=${encodeURIComponent(timezone)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load availability");
        return res.json();
      })
      .then((data) => {
        if (isMounted) setSlots(data.slots || []);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoadingSlots(false);
      });

    return () => { isMounted = false; };
  }, [slug, selectedDate, timezone]);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;
    const e164Phone = toE164(country, phone);
    if (!e164Phone) {
      setError("Enter your phone number.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/meetings/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          start: selectedSlot.start,
          end: selectedSlot.end,
          timezone,
          name,
          email,
          notes: notes.trim() || undefined,
          updatesOptIn,
          whatsappOptIn,
          country,
          phone: e164Phone,
        }),
      });

      // Defensive: a proxy/CDN layer in front of this app can replace an
      // error response's body with its own HTML page for some status
      // codes, which would otherwise crash a bare res.json() call here.
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error || "Booking failed. Please try again.");

      router.push(`/book/${slug}?success=true&bookingId=${data.booking?.id ?? ""}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Booking failed";
      setError(msg);
      setIsSubmitting(false);
    }
  };

  if (!selectedSlot) {
    return (
      <div className="space-y-6">
        {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Timezone</label>
          <BrandSelect
            value={timezone}
            onChange={setTimezone}
            options={timeZoneOptions}
            placeholder="Select your timezone"
            className="max-w-sm"
          />
          <p className="mt-1 text-xs text-ink-soft">Detected from your browser. You can pick any timezone.</p>
        </div>

        <div className="grid gap-8 md:grid-cols-[minmax(0,300px)_1fr]">
          <div className="rounded-xl border border-line p-4">
            <MonthCalendar selectedDate={selectedDate} onSelect={setSelectedDate} />
          </div>

          <div>
            <h3 className="mb-3 font-display text-lg font-semibold">
              {selectedDate ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Available slots"}
            </h3>
            {loadingSlots ? (
              <p className="animate-pulse text-sm text-ink-soft">Loading slots…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-ink-soft">No slots available on this date. Try another day on the calendar.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {slots.map((slot, i) => {
                  const dateObj = new Date(slot.start);
                  const timeString = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink hover:bg-paper-soft focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2"
                    >
                      {timeString}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleBook} className="max-w-md space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Confirm booking</h3>
        <button
          type="button"
          onClick={() => setSelectedSlot(null)}
          className="text-sm text-ink-soft underline hover:text-ink"
        >
          Change time
        </button>
      </div>

      <div className="mb-6 rounded-lg border border-line bg-paper-soft p-4">
        <p className="text-sm">
          <strong>Time:</strong> {new Date(selectedSlot.start).toLocaleString()}
        </p>
        <p className="mt-1 text-sm text-ink-soft">Timezone: {timezone}</p>
      </div>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-soft">Name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-soft">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-soft">What would you like to discuss? (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="A quick note helps the call start faster."
          className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
        />
      </div>

      <div>
        <label htmlFor="booking-phone" className="mb-1 block text-xs font-medium text-ink-soft">Phone</label>
        <PhoneInput id="booking-phone" country={country} value={phone} onChange={setPhone} />
        <p className="mt-1 text-xs text-ink-soft">We send the call confirmation and reminders on WhatsApp.</p>
      </div>

      <UpdatesOptIn
        checked={updatesOptIn}
        onChange={setUpdatesOptIn}
        whatsapp={whatsappOptIn}
        onWhatsAppChange={setWhatsappOptIn}
        hasPhone={!!toE164(country, phone)}
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 w-full rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {isSubmitting ? "Booking…" : "Confirm booking"}
      </button>
    </form>
  );
}
