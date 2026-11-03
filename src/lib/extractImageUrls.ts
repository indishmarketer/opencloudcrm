function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pulls every URL under our R2 public host out of a blob of text (a
 * forum post body with embedded markdown images, for example), so
 * whatever's about to be deleted from the DB can also be cleaned up in
 * R2. Returns [] if R2 isn't configured or the text has no matches,
 * never throws. */
export function extractR2ImageUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) return [];

  const re = new RegExp(`${escapeRegex(publicUrl)}/[^\\s)"'<>]+`, "g");
  const matches = text.match(re) || [];
  return Array.from(new Set(matches));
}
