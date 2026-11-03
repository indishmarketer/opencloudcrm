"use client";

import { useEffect, useRef, useState } from "react";

/** On-brand replacement for <input type="date">: the native picker renders
 * as blue OS chrome. Values are plain "YYYY-MM-DD" strings, like the native
 * input, so it drops into existing state. */

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDay(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function todayDay() {
  const d = new Date();
  return toDay(d.getFullYear(), d.getMonth(), d.getDate());
}

function parse(day: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(day);
  return m ? { year: Number(m[1]), month: Number(m[2]) - 1 } : null;
}

function label(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function BrandDatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Pick a date",
  ariaLabel,
  align = "left",
  fullWidth = false,
  variant = "pill",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  ariaLabel: string;
  align?: "left" | "right";
  fullWidth?: boolean;
  variant?: "pill" | "input";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const start = parse(value) || parse(max && max < todayDay() ? max : todayDay())!;
  const [view, setView] = useState(start);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (!open) setView(parse(value) || start);
    setOpen((o) => !o);
  }

  function shift(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const today = todayDay();
  const first = new Date(view.year, view.month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDay(view.year, view.month, i + 1)),
  ];
  const outOfRange = (day: string) => (!!min && day < min) || (!!max && day > max);
  const monthLabel = first.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const buttonClasses =
    variant === "input"
      ? `flex ${fullWidth ? "w-full" : "min-w-[8.5rem]"} items-center justify-between gap-2 rounded-lg border bg-paper px-3 py-2.5 text-sm text-left transition-colors outline-none focus:border-ink ${
          open ? "border-ink text-ink ring-1 ring-ink" : "border-line text-ink hover:border-ink"
        }`
      : `flex ${fullWidth ? "w-full" : "min-w-[8.5rem]"} items-center justify-between gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
          open ? "border-ink text-ink" : "border-line text-ink hover:border-ink"
        }`;

  return (
    <div ref={ref} className={`relative ${fullWidth ? "block w-full" : "inline-block"} ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={buttonClasses}
      >
        <span className={value ? "" : "text-ink-soft"}>{value ? label(value) : placeholder}</span>
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-ink-soft" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="2" y="3" width="12" height="11" rx="2" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={ariaLabel}
          className={`absolute z-50 mt-2 w-64 rounded-2xl border border-line bg-paper p-3 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="rounded-full px-2 py-1 text-ink-soft hover:bg-paper-soft hover:text-ink">
              ‹
            </button>
            <p className="text-sm font-semibold">{monthLabel}</p>
            <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded-full px-2 py-1 text-ink-soft hover:bg-paper-soft hover:text-ink">
              ›
            </button>
          </div>
          <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-medium text-ink-soft">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-1">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {cells.map((day, i) =>
              day ? (
                <button
                  key={day}
                  type="button"
                  disabled={outOfRange(day)}
                  onClick={() => {
                    onChange(day);
                    setOpen(false);
                  }}
                  aria-pressed={day === value}
                  className={`h-8 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                    day === value
                      ? "bg-ink font-semibold text-paper"
                      : day === today
                        ? "border border-ink text-ink hover:bg-paper-soft"
                        : "text-ink hover:bg-paper-soft"
                  }`}
                >
                  {Number(day.slice(8))}
                </button>
              ) : (
                <span key={`blank-${i}`} />
              )
            )}
          </div>
          <div className="mt-2 flex justify-between border-t border-line pt-2 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="text-ink-soft hover:text-ink"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={outOfRange(today)}
              onClick={() => {
                onChange(today);
                setOpen(false);
              }}
              className="text-ink hover:underline disabled:opacity-30"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}