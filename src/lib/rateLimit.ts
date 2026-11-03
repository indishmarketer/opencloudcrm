import { pool } from "@/lib/db";
import crypto from "node:crypto";

export function privateRateLimitKey(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/** Shared, atomic rate limiting across restarts and application replicas. */
export async function consumeRateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const result = await pool.query(
    `INSERT INTO rate_limits AS current_limit (key, window_start, count)
     VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       window_start = CASE
         WHEN current_limit.window_start <= now() - ($2 * interval '1 second')
         THEN now() ELSE current_limit.window_start END,
       count = CASE
         WHEN current_limit.window_start <= now() - ($2 * interval '1 second')
         THEN 1 ELSE current_limit.count + 1 END
     RETURNING count`,
    [key.slice(0, 500), windowSeconds],
  );
  return Number(result.rows[0]?.count) <= max;
}

export const checkRateLimit = consumeRateLimit;
