import fs from "node:fs";
import path from "node:path";

export type ConsolePageResult = { title: string; href: string; section: string };

function humanize(segment: string): string {
  return decodeURIComponent(segment)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Use Next's built route manifest as the page-search index. Pages added or
 * removed from the console are reflected by the next build automatically,
 * without maintaining a second list in the search component.
 */
export function searchConsolePages(query: string, limit = 12): ConsolePageResult[] {
  const manifestPath = path.join(process.cwd(), ".next", "server", "app-paths-manifest.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, string>;
    const excludedPath = path.join(process.cwd(), "public", "console-search-excluded-routes.json");
    let excludedRoutes: string[] = [];
    try {
      excludedRoutes = JSON.parse(fs.readFileSync(excludedPath, "utf8")) as string[];
    } catch {
      // Direct `next dev`/`next start` invocations still get route discovery;
      // npm's predev/prebuild hooks additionally exclude redirect-only aliases.
    }
    const excluded = new Set(excludedRoutes);
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const found = new Map<string, ConsolePageResult>();

    for (const [manifestRoute, modulePath] of Object.entries(manifest)) {
      if (!manifestRoute.startsWith("/console/") || !manifestRoute.endsWith("/page")) continue;
      if (/\[(?:\.\.\.)?.+?\]/.test(manifestRoute)) continue;
      const route = manifestRoute
        .replace(/\/\([^/]+\)/g, "")
        .replace(/\/page$/, "")
        .replace(/\/$/, "");
      if (!route.startsWith("/console/") || route.includes("/(") || route.includes("//")) continue;
      if (excluded.has(route)) continue;

      const parts = route.split("/").filter(Boolean).slice(1);
      if (!parts.length) continue;
      const title = parts.map(humanize).join(" ");
      const section = humanize(parts[0]);
      const result = { title, href: route, section };
      if (`${title} ${section} ${route}`.toLocaleLowerCase().includes(normalizedQuery)) {
        found.set(route, result);
      }
    }

    return [...found.values()]
      .sort((left, right) => {
        const leftExact = left.title.toLocaleLowerCase().startsWith(normalizedQuery) ? 0 : 1;
        const rightExact = right.title.toLocaleLowerCase().startsWith(normalizedQuery) ? 0 : 1;
        return leftExact - rightExact || left.title.localeCompare(right.title);
      })
      .slice(0, limit);
  } catch {
    return [];
  }
}
