/** Everything the unified /api/v1/* surface can be scoped to grant. "*"
 * on a token means every scope below, for a self-hoster's own
 * full-access automation/MCP token. Extend this list as new /api/v1/*
 * resources ship -- it's the source of truth both the console's scope
 * picker and the token-validation logic read from. No other imports
 * here on purpose: this file is safe to import from a client component,
 * unlike src/lib/apiTokens.ts (which pulls in next/headers via auth.ts). */
export const API_SCOPES = [
  "directory:read",
  "directory:write",
  "blog:read",
  "blog:write",
  "pages:read",
  "pages:write",
  "courses:read",
  "courses:write",
  "workflows:read",
  "workflows:write",
  "media:read",
  "media:write",
  "email:read",
  "email:write",
  "site:read",
  "site:write",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];
/** A scope as actually stored on a token/grant -- any single scope, or
 * "*" for every scope at once. */
export type GrantedScope = ApiScope | "*";

/** API_SCOPES grouped by resource (every "x:read"/"x:write" pair), for a
 * one-row-per-resource picker instead of a flat list of checkboxes. Add a
 * label here when a new resource's scopes are added above. */
export const SCOPE_RESOURCE_LABELS: Record<string, string> = {
  directory: "Directory",
  blog: "Blog",
  pages: "Pages",
  courses: "Courses",
  workflows: "Workflows",
  media: "Media library",
  email: "Email templates",
  site: "Site settings",
};

export const SCOPE_RESOURCES: { resource: string; label: string; read: ApiScope; write: ApiScope }[] = (() => {
  const resources = Array.from(new Set(API_SCOPES.map((s) => s.split(":")[0])));
  return resources.map((resource) => ({
    resource,
    label: SCOPE_RESOURCE_LABELS[resource] || resource,
    read: `${resource}:read` as ApiScope,
    write: `${resource}:write` as ApiScope,
  }));
})();
