import { SignJWT, jwtVerify } from "jose";
// From its actual source module, not @/lib/auth -- that re-exports the same
// function but also top-level-imports next/headers, which node:test can't
// resolve outside Next's own runtime (same root cause documented in
// outbound-webhooks.md / meetings-and-webinars.md for consoleAdmins.ts).
import { getSessionSecret } from "@/lib/sessionSecret";

const secret = () => new TextEncoder().encode(getSessionSecret());

/** Lets an attendee reschedule/cancel their own booking from an emailed
 * link without needing an account or a login -- most attendees are
 * guests. Deliberately reusable (no single-use jti, unlike the magic-link/
 * password-reset tokens in auth.ts): the same link in the confirmation,
 * reminder, and reschedule emails should keep working every time it's
 * clicked, not just once. Scoped to one specific booking id; a 90-day
 * expiry bounds it defensively without meaningfully limiting real use --
 * meetings are booked well within a year of "now", never that far out. */
export async function createMeetingManageToken(bookingId: number): Promise<string> {
  return new SignJWT({ purpose: "manage-meeting-booking", bookingId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secret());
}

export async function verifyMeetingManageToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "manage-meeting-booking" || typeof payload.bookingId !== "number") return null;
    return payload.bookingId;
  } catch {
    return null;
  }
}
