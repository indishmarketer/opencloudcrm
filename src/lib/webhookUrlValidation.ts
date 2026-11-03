import dns from "node:dns";
import ipaddr from "ipaddr.js";

export type UrlValidationResult =
  | { ok: true; resolvedAddress: string; family: number }
  | { ok: false; reason: string };

/** Rejects loopback, private (RFC1918), link-local (including the
 * 169.254.169.254 cloud metadata address), unique-local, and any other
 * non-"unicast" range. ipaddr.js's range() already classifies all of these
 * correctly for both IPv4 and IPv6 (link-local, uniqueLocal, loopback, etc.
 * are all distinct from "unicast"). */
function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

/** Validates an outbound webhook destination URL for SSRF safety:
 * HTTPS-only in production, no embedded credentials, and DNS resolves only
 * to public addresses. Returns the resolved address so the caller can pin
 * the connection to it (never re-resolve at connect time -- that would
 * reopen a DNS-rebinding TOCTOU gap between this check and the real
 * request). Mirrors src/lib/safeRemoteImage.ts's pinned-DNS pattern. */
export async function validateOutboundWebhookUrl(rawUrl: string): Promise<UrlValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }

  const allowHttp = process.env.NODE_ENV !== "production";
  const allowedProtocols = allowHttp ? ["http:", "https:"] : ["https:"];
  if (!allowedProtocols.includes(parsed.protocol)) {
    return { ok: false, reason: allowHttp ? "Only HTTP and HTTPS URLs are allowed." : "Only HTTPS URLs are allowed in production." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URLs containing credentials are not allowed." };
  }

  const hostname = parsed.hostname;
  // Literal IP hostnames skip DNS entirely -- validate the literal directly.
  if (ipaddr.isValid(hostname)) {
    if (!isPublicAddress(hostname)) {
      return { ok: false, reason: "Private, loopback, link-local, and other non-public destinations are not allowed." };
    }
    const parsedIp = ipaddr.process(hostname);
    return { ok: true, resolvedAddress: hostname, family: parsedIp.kind() === "ipv6" ? 6 : 4 };
  }

  let records: dns.LookupAddress[];
  try {
    records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: "The destination host name did not resolve." };
  }
  if (records.length === 0) {
    return { ok: false, reason: "The destination host name did not resolve." };
  }
  for (const record of records) {
    if (!isPublicAddress(record.address)) {
      return { ok: false, reason: "Private, loopback, link-local, and other non-public destinations are not allowed." };
    }
  }

  return { ok: true, resolvedAddress: records[0].address, family: records[0].family };
}
