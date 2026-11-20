/** The round avatar beside a blog or course comment: the commenter's
 * uploaded picture when they have one, their initials when they do not.
 * Distinct from components/Avatar.tsx, which is the WhatsApp inbox's
 * initials-only chip and takes no image. */
import { initialsOf } from "@/lib/initials";

export default function MemberAvatar({
  url,
  name,
  size = 24,
}: {
  url: string | null;
  name: string | null;
  size?: number;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ? `${name}'s avatar` : "User avatar"}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-paper-soft font-medium text-ink-soft"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initialsOf(name)}
    </span>
  );
}
