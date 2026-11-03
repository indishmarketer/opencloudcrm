import { Pool } from "pg";
import type { PoolClient } from "pg";

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
