"use client";

/** An on/off switch with the current state spelled out next to it.
 *
 * Consent used to read as the word "Subscribed" followed by a button
 * labelled "Turn off", which is two things saying almost the same thing and
 * made the row text-heavy enough to be hard to scan. One control now says
 * both what the state is and how to change it: green when they are in, red
 * when they are out, plain grey when nobody has ever asked. */
export default function ToggleSwitch({
  on,
  label,
  state,
  tone = on ? "on" : "off",
  busy = false,
  disabled = false,
  onToggle,
}: {
  on: boolean;
  /** What the switch controls, for screen readers. */
  label: string;
  /** The current state in words: "Subscribed", "Opted out", "Not asked". */
  state: string;
  /** Colour of the state word; "unknown" for a consent nobody has set. */
  tone?: "on" | "off" | "unknown";
  busy?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const track = on ? "bg-green-600" : tone === "unknown" ? "bg-line" : "bg-red-500";
  const text = tone === "on" ? "text-green-700" : tone === "off" ? "text-red-600" : "text-ink-soft";

  return (
    <span className="flex items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled || busy}
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${track}`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-[1.125rem]" : "translate-x-0.5"}`}
        />
      </button>
      <span className={`text-sm font-medium ${text}`}>{busy ? "Saving…" : state}</span>
    </span>
  );
}
