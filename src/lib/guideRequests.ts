import crypto from "node:crypto";
import { pool } from "@/lib/db";

export type GuideRequest = {
  id: number;
  token: string;
  guide_id: number;
  email: string;
  name: string | null;
  phone: string | null;
  country: string | null;
  created_at: Date;
  first_opened_at: Date | null;
  last_opened_at: Date | null;
  open_count: number;
};

/** Records one free-guide request and returns the token that goes in the
 * download link. The token never expires and can be opened more than once:
 * the point of it is to catch the open whenever it happens, not to fence
 * off the file. */
export async function createGuideRequest(input: {
  guideId: number;
  email: string;
  name: string | null;
  phone: string | null;
  country: string | null;
}): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO guide_requests (token, guide_id, email, name, phone, country)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [token, input.guideId, input.email, input.name, input.phone, input.country],
  );
  return token;
}

/** Marks a download link as opened and hands back the request behind it.
 * `alreadyOpened` tells the caller whether this is the first open, so the
 * one-time work (promoting the contact, firing the webhook) does not run
 * again every time someone re-downloads from the same email. */
export async function markGuideRequestOpened(
  token: string,
): Promise<{ request: GuideRequest; alreadyOpened: boolean } | null> {
  const result = await pool.query<GuideRequest & { was_opened: boolean }>(
    `UPDATE guide_requests
     SET first_opened_at = COALESCE(first_opened_at, now()),
         last_opened_at = now(),
         open_count = open_count + 1
     WHERE token = $1
     RETURNING *, (open_count > 1) AS was_opened`,
    [token],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { request: row, alreadyOpened: row.was_opened };
}
