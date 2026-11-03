/** Decides whether an email link click came from a person or from a mail
 * security scanner (Microsoft Safe Links, Mimecast, Proofpoint, Barracuda
 * and similar), which open every link in a message to check it. Scanner
 * clicks must not count as engagement or trigger click-based automation.
 * Pure function so it can be unit tested. */

const SCANNER_UA =
  /bot|crawl|spider|scan|preview|barracuda|proofpoint|mimecast|safelinks|forcepoint|sophos|fortinet|trend ?micro|symantec|messagelabs|cisco|ironport|zscaler|python|curl|wget|httpclient|okhttp|go-http|java\/|libwww|headless|phantom|puppeteer|playwright/i;

/** Clicks this soon after the email left our server are almost always a
 * scanner checking links on delivery, not a person reading it. */
export const MIN_HUMAN_SECONDS_AFTER_SEND = 10;

/** A person clicks one link; a scanner opens several within a second or two. */
export const BURST_WINDOW_SECONDS = 2;

export type ClickVerdict = { human: true } | { human: false; reason: string };

export function classifyEmailClick(input: {
  method: string;
  userAgent: string | null;
  sentAt: Date | null;
  now: Date;
  otherLinkClickedWithinBurst: boolean;
}): ClickVerdict {
  if (input.method !== "GET") return { human: false, reason: "non-GET request" };
  const ua = input.userAgent?.trim() || "";
  if (!ua) return { human: false, reason: "no user agent" };
  if (SCANNER_UA.test(ua)) return { human: false, reason: "scanner user agent" };
  if (input.sentAt) {
    const seconds = (input.now.getTime() - input.sentAt.getTime()) / 1000;
    if (seconds >= 0 && seconds < MIN_HUMAN_SECONDS_AFTER_SEND) return { human: false, reason: "clicked seconds after send" };
  }
  if (input.otherLinkClickedWithinBurst) return { human: false, reason: "several links opened at once" };
  return { human: true };
}
