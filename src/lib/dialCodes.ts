/** ISO 3166-1 alpha-2 -> international calling code. Used to prefix a phone
 * number input with the right "+91" style code once a country is chosen, so
 * the person never has to type their own country code. Not exhaustive of
 * every territory in countries.ts (some share a code, e.g. NANP members all
 * use +1); anything missing falls back to no prefix. */
export const DIAL_CODES: Record<string, string> = {
  US: "1", CA: "1", AG: "1", AI: "1", BB: "1", BM: "1", BS: "1", DM: "1", DO: "1",
  GD: "1", JM: "1", KN: "1", KY: "1", LC: "1", MS: "1", PR: "1", TC: "1", TT: "1",
  VC: "1", VG: "1", VI: "1",
  IN: "91", GB: "44", AU: "61", DE: "49", FR: "33", IT: "39", ES: "34", NL: "31",
  BE: "32", CH: "41", AT: "43", SE: "46", NO: "47", DK: "45", FI: "358", PL: "48",
  PT: "351", IE: "353", GR: "30", CZ: "420", HU: "36", RO: "40", BG: "359",
  HR: "385", SK: "421", SI: "386", LT: "370", LV: "371", EE: "372", IS: "354",
  LU: "352", MT: "356", CY: "357",
  PK: "92", BD: "880", LK: "94", NP: "977", BT: "975", MV: "960", AF: "93",
  CN: "86", JP: "81", KR: "82", HK: "852", MO: "853", TW: "886", SG: "65",
  MY: "60", TH: "66", VN: "84", PH: "63", ID: "62", KH: "855", LA: "856",
  MM: "95", BN: "673",
  AE: "971", SA: "966", QA: "974", KW: "965", BH: "973", OM: "968", JO: "962",
  LB: "961", IL: "972", IQ: "964", IR: "98", TR: "90", EG: "20", SY: "963",
  YE: "967", PS: "970",
  ZA: "27", NG: "234", KE: "254", GH: "233", ET: "251", TZ: "255", UG: "256",
  DZ: "213", MA: "212", TN: "216", LY: "218", SD: "249", ZM: "260", ZW: "263",
  SN: "221", CI: "225", CM: "237", MG: "261", RW: "250", MW: "265", MZ: "258",
  NA: "264", BW: "267", GA: "241",
  BR: "55", MX: "52", AR: "54", CL: "56", CO: "57", PE: "51", VE: "58",
  EC: "593", GT: "502", CR: "506", PA: "507", UY: "598", BO: "591", PY: "595",
  HN: "504", NI: "505", SV: "503", CU: "53",
  RU: "7", KZ: "7", UA: "380", BY: "375", GE: "995", AM: "374", AZ: "994",
  UZ: "998", KG: "996", TJ: "992", TM: "993", MD: "373",
  NZ: "64", FJ: "679", PG: "675",
};

export function dialCode(country: string | null | undefined): string {
  if (!country) return "";
  return DIAL_CODES[country] || "";
}

/** Reverses toE164: given the stored digits-only phone and the person's
 * country, drops the leading calling code so an edit form can show just
 * the national number back in the input. Falls back to the full stored
 * value when the code doesn't match (e.g. country changed since saving). */
export function stripDialCode(country: string | null | undefined, phone: string | null | undefined): string {
  if (!phone) return "";
  const code = dialCode(country);
  return code && phone.startsWith(code) ? phone.slice(code.length) : phone;
}
