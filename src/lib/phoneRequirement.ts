/** Countries where a phone number is required at signup, not optional.
 *
 * These are the markets where WhatsApp is the normal way people expect to
 * be reached about something they bought, so a missing number there costs
 * us the main delivery channel. Everywhere else (US, Canada, UK, Europe,
 * Australia, East Asia, LatAm) email is the norm and the field stays
 * optional, because forcing it there only costs signups.
 *
 * Shared by the signup form and the signup route, so no server-only
 * imports here. Editing this one list changes the rule everywhere.
 */
export const PHONE_REQUIRED_COUNTRIES = new Set([
  // South Asia
  "IN", "PK", "BD", "LK", "NP", "BT", "MV", "AF",
  // Southeast Asia
  "PH", "ID",
  // Middle East
  "AE", "SA", "QA", "KW", "BH", "OM", "JO", "LB", "IQ", "YE", "SY", "PS", "TR",
  // Africa
  "NG", "EG", "KE", "GH", "ZA",
]);

export function isPhoneRequired(country: string | null | undefined): boolean {
  return !!country && PHONE_REQUIRED_COUNTRIES.has(country);
}
