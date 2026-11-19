/** "About Us!" -> "about-us". Lived in promptLibrary.ts until the prompt &
 * skill library was retired; it is a generic helper and the only part of
 * that module anything still used. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
