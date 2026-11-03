/**
 * First and last initials for an avatar: "Rohit Sharma" becomes RS,
 * "Ankit Tiwari" AT.
 *
 * One letter was ambiguous at a glance in any thread where several people
 * share a first letter, which is most threads.
 *
 * Takes the first and *last* word rather than the first two, so a middle
 * name does not push the surname out. Falls back to one letter for a single
 * word, and to a neutral mark when there is no name at all, because an
 * empty circle reads as something still loading.
 *
 * Its own file rather than living beside the component: it is a pure
 * function worth testing, and the test runner cannot load a .tsx file.
 */
export function initialsOf(name: string | null | undefined): string {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}
