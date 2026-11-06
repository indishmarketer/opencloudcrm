"use client";

import { useEffect, useMemo, useState } from "react";
import BrandSelect from "@/components/BrandSelect";
import ConsoleModal from "@/components/ConsoleModal";
import { MonthCalendar } from "@/components/MonthCalendar";
import { indiaDateTimeInput, parseIndiaDateTime } from "@/lib/indiaTime";

function initialDateTime(value: string) {
  if (value) return value;
  const roundedUp = new Date(Math.ceil((Date.now() + 1) / 300_000) * 300_000);
  return indiaDateTimeInput(roundedUp);
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour).padStart(2, "0"), label: `${String(hour).padStart(2, "0")}:00` }));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, minute) => ({ value: String(minute).padStart(2, "0"), label: String(minute).padStart(2, "0") }));

export default function ScheduleDateTimeModal({
  title,
  actionLabel,
  initialValue,
  busy = false,
  error = "",
  onClose,
  onSchedule,
}: {
  title: string;
  actionLabel: string;
  initialValue: string;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onSchedule: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [validationError, setValidationError] = useState("");
  useEffect(() => {
    if (!value) {
      // Resolve the default time after hydration so the server and browser
      // don't render different values when a five-minute boundary passes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(initialDateTime(initialValue));
    }
  }, [initialValue, value]);
  const [date, clock] = value.split("T");
  const [hour = "09", minute = "00"] = (clock || "09:00").split(":");
  const dateLabel = useMemo(() => {
    if (!date) return "Choose a date";
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(`${date}T12:00:00+05:30`));
  }, [date]);
  const isValid = Boolean(parseIndiaDateTime(value));

  function updateTime(nextHour: string, nextMinute: string) {
    if (!date) return;
    setValue(`${date}T${nextHour}:${nextMinute}`);
    setValidationError("");
  }

  function schedule() {
    if (!isValid) {
      setValidationError("Choose a future date and time in IST.");
      return;
    }
    setValidationError("");
    void onSchedule(value);
  }

  return (
    <ConsoleModal title={title} onClose={onClose} size="md">
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          Choose when this {title.toLowerCase().replace("schedule ", "")} should be sent. All times are in India Standard Time (IST).
        </p>
        <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-line bg-paper p-3 sm:p-4">
            <MonthCalendar
              selectedDate={date}
              onSelect={(nextDate) => {
                setValue(`${nextDate}T${hour}:${minute}`);
                setValidationError("");
              }}
            />
          </div>
          <div className="flex flex-col justify-between">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-soft">Hour</label>
                  <BrandSelect value={hour} onChange={(next) => updateTime(next, minute)} options={HOUR_OPTIONS} searchable={false} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-soft">Minute</label>
                  <BrandSelect value={minute} onChange={(next) => updateTime(hour, next)} options={MINUTE_OPTIONS} searchable />
                </div>
              </div>
              <div className="rounded-lg bg-paper-soft px-3 py-2.5 text-sm">
                <span className="text-ink-soft">Will send at </span>
                <span className="font-medium text-ink">{dateLabel}, {hour}:{minute} IST</span>
              </div>
              {(validationError || error) && <p role="alert" className="text-sm text-red-600">{error || validationError}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="h-10 rounded-full border border-line px-4 text-sm font-medium transition-colors hover:border-ink disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={schedule}
                disabled={busy}
                className="h-10 rounded-full bg-ink px-5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                {busy ? "Scheduling…" : actionLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ConsoleModal>
  );
}
