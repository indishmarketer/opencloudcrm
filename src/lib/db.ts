import { Pool } from "pg";
import type { PoolClient } from "pg";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

declare global {
  var _pgPool: Pool | undefined;
}

/** True when a Postgres error is a unique-violation (23505), i.e. a
 * duplicate insert on a unique constraint/index. Used to distinguish "name
 * already exists" from genuine server/DB failures so the latter are never
 * misreported to the user as a validation error. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as { code?: unknown }).code === "23505";
}

export const pool =
  global._pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

// Idle clients emit 'error' on unexpected disconnects (e.g. the DB
// restarting) -- without a handler, that's an uncaught exception that
// crashes the whole Node process instead of just failing the next query.
pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client:", err);
});

global._pgPool = pool;

/** Runs a DB read that's safe to skip during `next build`: a fresh
 * self-host install's database may not exist or be migrated yet when the
 * Docker image builds (see Dockerfile -- migrations run on container boot,
 * which is after the image is already built), so a query that only feeds
 * static generation shouldn't fail the whole production build over it.
 * Falls back to `fallback` ONLY during that build phase; an identical
 * failure at request time (a real outage) still throws normally so it
 * surfaces as an actual error instead of silently serving stale/empty
 * data. Mirrors the pattern already used for site_settings reads in
 * siteChrome.ts / siteIdentity.ts, generalized for callers that can't
 * afford to return defaults at runtime too. */
export async function buildSafe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
      console.error("DB read failed during build, using fallback.", err);
      return fallback;
    }
    throw err;
  }
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
