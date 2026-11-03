import { nameInitials } from "@/lib/whatsappFormat";

/** A round avatar built from someone's initials, the way a chat app shows
 * who a conversation is with. No photo: WhatsApp does not hand profile
 * pictures to the Cloud API, and this is a name we already hold.
 *
 * One colour on purpose. Hashing a name to a colour is the usual trick, but
 * this site runs on black, white and red, and a wall of pastel circles
 * would be the loudest thing on the page. */
export default function Avatar({
  name,
  size = "md",
  className = "",
}: {
  name: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  const initials = nameInitials(name);
  const box = size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm";

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-ink font-medium text-paper ${box} ${className}`}
    >
      {initials || (
        // A number nobody has a name for. The glyph says "person" without
        // inventing initials out of digits.
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      )}
    </span>
  );
}
