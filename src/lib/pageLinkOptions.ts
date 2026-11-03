import { listPages } from "@/lib/sitePages";
import { BUILT_IN_PAGES } from "@/lib/defaultPages";

/** Suggestions for link fields in the console editors: every page plus
 * the app's own main sections. */
export async function getPageLinkOptions(): Promise<string[]> {
  const pages = await listPages().catch(() => []);
  return Array.from(
    new Set([
      ...pages.map((p) => p.path || "").filter(Boolean),
      ...BUILT_IN_PAGES.map((p) => p.path),
      "/book/discovery-call",
      "/community/general",
      "/apply-to-write",
      "/resources/prompt-skill-library",
      "/signup",
      "/login",
    ])
  ).sort();
}
