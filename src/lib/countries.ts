/** ISO 3166-1 alpha-2 codes (plus XK, which Cloudflare reports for Kosovo).
 * Shared by the browser country picker and the server, so no server-only
 * imports here. */
export const COUNTRY_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE
BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD
CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM
DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF
GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU
ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN
KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME
MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA
NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM
PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI
SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK
TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI
VN VU WF WS XK YE YT ZA ZM ZW`.trim().split(/\s+/);

const CODE_SET = new Set(COUNTRY_CODES);

/** Upper-cases and validates; anything that isn't a real country code
 * (including Cloudflare's XX for unknown and T1 for Tor) becomes null. */
export function normalizeCountry(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return CODE_SET.has(code) ? code : null;
}

let displayNames: Intl.DisplayNames | null = null;

export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  try {
    displayNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return displayNames.of(code) || code;
  } catch {
    return code;
  }
}

/** Every country sorted by name, India first (most of the audience). */
export function countryOptions(): { value: string; label: string }[] {
  const all = COUNTRY_CODES.map((code) => ({ value: code, label: countryName(code) }));
  all.sort((a, b) => a.label.localeCompare(b.label));
  const india = all.findIndex((c) => c.value === "IN");
  if (india > 0) all.unshift(...all.splice(india, 1));
  return all;
}

/** Device clock set to Indian time is a strong India signal that a VPN
 * doesn't change, so it beats the IP guess when prefilling a picker. */
export function isIndianTimeZone(timeZone: string | undefined): boolean {
  return timeZone === "Asia/Kolkata" || timeZone === "Asia/Calcutta";
}

/** Pure rule, exported for tests: India (or unknown) pays through Razorpay;
 * everyone else through PayPal, with Razorpay as the fallback if PayPal is
 * switched off (it takes international cards once enabled). */
export function pickCheckoutMethod(
  country: string | null,
  razorpay: boolean,
  paypal: boolean,
): "razorpay" | "paypal" | null {
  if (country === null || country === "IN") return razorpay ? "razorpay" : null;
  return paypal ? "paypal" : razorpay ? "razorpay" : null;
}
