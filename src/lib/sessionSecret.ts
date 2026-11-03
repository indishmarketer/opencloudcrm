/** Shared by src/lib/auth.ts and src/proxy.ts. Kept in its own file with no
 * other dependencies (no `pg`, no `next/headers`) so proxy.ts -- which runs
 * before every /account/* request and previously had its own duplicated
 * copy of this function -- can import it without pulling in the DB pool or
 * anything else auth.ts depends on. */
export function getSessionSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  // Only ever acceptable locally -- if this were silently used in
  // production, every session/reset/magic-link JWT would be signable by
  // anyone who reads this file, since it's a fixed public string.
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set. Refusing to start with an insecure fallback in production.");
  }
  return "dev-secret-change-me";
}
