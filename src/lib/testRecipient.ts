/** Optional "send test to" address on the console's test-send buttons, so a
 * test can go to a personal Gmail/Outlook to check how it really looks
 * there. Owner/admin-only routes; anything that isn't a plain address is
 * ignored and the test goes to the logged-in admin instead. */
export function cleanTestRecipient(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/.test(email)) return null;
  return email;
}
