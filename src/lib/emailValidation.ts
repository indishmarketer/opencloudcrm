/**
 * Email domain auto-suggestion and typo detection system.
 * Prevents visitor email typos (e.g. @icliud.com, @icloud.con, @gmaili.com).
 */

export const POPULAR_EMAIL_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "hotmail.com",
  "proton.me",
  "protonmail.com",
  "rediffmail.com",
  "live.com",
  "zoho.com",
  "aol.com",
] as const;

export const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  // iCloud typos
  "icliud.com": "icloud.com",
  "icluod.com": "icloud.com",
  "iclud.com": "icloud.com",
  "iclode.com": "icloud.com",
  "iclod.com": "icloud.com",
  "icoud.com": "icloud.com",
  "icloud.con": "icloud.com",
  "icloud.co": "icloud.com",
  "icloud.cm": "icloud.com",

  // Gmail typos
  "gmaili.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmaik.com": "gmail.com",
  "gmeil.com": "gmail.com",
  "gmil.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmai.co": "gmail.com",

  // Yahoo typos
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yaho.co": "yahoo.com",
  "yaho.con": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yahoou.com": "yahoo.com",

  // Hotmail typos
  "hotmial.com": "hotmail.com",
  "hotmaill.com": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmali.com": "hotmail.com",
  "hotmail.con": "hotmail.com",

  // Outlook typos
  "outloo.com": "outlook.com",
  "outlok.com": "outlook.com",
  "putlook.com": "outlook.com",
  "outllok.com": "outlook.com",
  "outlook.con": "outlook.com",

  // Proton typos
  "protonmai.com": "protonmail.com",
  "prtonmail.com": "protonmail.com",
  "protonmal.com": "protonmail.com",
  "protonmail.con": "protonmail.com",

  // Rediffmail typos
  "redifmail.com": "rediffmail.com",
  "rediff.com": "rediffmail.com",
  "redif.com": "rediffmail.com",
  "rediffmal.com": "rediffmail.com",
  "rediffmail.con": "rediffmail.com",
};

/**
 * Returns matching domains for an email prefix or domain snippet.
 * E.g. "user@g" -> ["gmail.com"]
 * E.g. "user@" -> ["gmail.com", "outlook.com", "yahoo.com", ...]
 */
export function getDomainSuggestions(domainPart: string): string[] {
  const query = domainPart.toLowerCase().trim();
  if (!query) {
    return [...POPULAR_EMAIL_DOMAINS];
  }
  return POPULAR_EMAIL_DOMAINS.filter((d) => d.startsWith(query));
}

export type AutoSuggestionResult = {
  /** The remaining suffix to complete the first matching domain inline (e.g. "mail.com" if typed "g") */
  ghostSuffix: string | null;
  /** The full domain matched (e.g. "gmail.com") */
  matchedDomain: string | null;
  /** List of all matching popular domains */
  suggestions: string[];
};

/**
 * Analyzes current input and produces inline ghost text + list of candidate domains.
 */
export function computeEmailSuggestion(input: string): AutoSuggestionResult {
  const atIndex = input.lastIndexOf("@");
  if (atIndex === -1) {
    return { ghostSuffix: null, matchedDomain: null, suggestions: [] };
  }

  const domainPart = input.slice(atIndex + 1).toLowerCase();
  const matches = getDomainSuggestions(domainPart);

  if (matches.length > 0 && domainPart.length > 0) {
    const best = matches[0];
    if (best !== domainPart && best.startsWith(domainPart)) {
      return {
        ghostSuffix: best.slice(domainPart.length),
        matchedDomain: best,
        suggestions: matches,
      };
    }
  }

  return {
    ghostSuffix: null,
    matchedDomain: matches[0] || null,
    suggestions: matches,
  };
}

export type TypoCheckResult = {
  hasTypo: boolean;
  suggestedEmail: string | null;
  correctedDomain: string | null;
  originalDomain: string | null;
};

/**
 * Checks an email string for known domain misspellings (e.g. icliud.com -> icloud.com, .con -> .com).
 */
export function detectEmailTypo(email: string): TypoCheckResult {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex === -1 || atIndex === trimmed.length - 1) {
    return { hasTypo: false, suggestedEmail: null, correctedDomain: null, originalDomain: null };
  }

  const userPart = trimmed.slice(0, atIndex);
  let domainPart = trimmed.slice(atIndex + 1);

  // Check direct typo dictionary:
  if (COMMON_DOMAIN_TYPOS[domainPart]) {
    const fixedDomain = COMMON_DOMAIN_TYPOS[domainPart];
    return {
      hasTypo: true,
      suggestedEmail: `${userPart}@${fixedDomain}`,
      correctedDomain: fixedDomain,
      originalDomain: domainPart,
    };
  }

  // Check ending with .con or .cmo or .cpm instead of .com:
  if (/\.(con|cmo|cpm|comm|coom)$/i.test(domainPart)) {
    const fixedDomain = domainPart.replace(/\.(con|cmo|cpm|comm|coom)$/i, ".com");
    return {
      hasTypo: true,
      suggestedEmail: `${userPart}@${fixedDomain}`,
      correctedDomain: fixedDomain,
      originalDomain: domainPart,
    };
  }

  // Check if someone typed something like "gmaill" without tld:
  if (domainPart === "gmail" || domainPart === "gmial" || domainPart === "gamil") {
    return {
      hasTypo: true,
      suggestedEmail: `${userPart}@gmail.com`,
      correctedDomain: "gmail.com",
      originalDomain: domainPart,
    };
  }

  if (domainPart === "icloud" || domainPart === "icliud") {
    return {
      hasTypo: true,
      suggestedEmail: `${userPart}@icloud.com`,
      correctedDomain: "icloud.com",
      originalDomain: domainPart,
    };
  }

  return { hasTypo: false, suggestedEmail: null, correctedDomain: null, originalDomain: null };
}

/**
 * Returns the corrected email if a typo was detected, otherwise returns the original email.
 */
export function correctEmailTypo(email: string): string {
  const check = detectEmailTypo(email);
  return check.hasTypo && check.suggestedEmail ? check.suggestedEmail : email;
}
