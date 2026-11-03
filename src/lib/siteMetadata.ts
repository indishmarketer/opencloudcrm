import dns from "node:dns";
import ipaddr from "ipaddr.js";
import { Agent, request } from "undici";
import { SITE_NAME, SITE_URL } from "@/config/brand";

const BOT_USER_AGENT = `${SITE_NAME.replace(/\s+/g, "")}Bot/1.0 (+${SITE_URL}/tools)`;

/**
 * Reads the public metadata off a URL someone pasted into the tool submit
 * form, so they get a prefilled listing instead of five empty boxes.
 *
 * This fetches a URL chosen by an anonymous visitor, which is a server-side
 * request forgery hole if written naively, so it follows the same rules as
 * `fetchSafeRemoteImage`: resolve the hostname first, refuse anything that
 * is not a public unicast address, then pin the connection to the address
 * we checked, so a second DNS lookup cannot swap in 127.0.0.1 or a cloud
 * metadata endpoint. Redirects are re-checked the same way rather than
 * followed blindly, and the body is capped and timed out.
 *
 * Kept separate from safeRemoteImage.ts rather than folded into it: that
 * one exists to refuse anything that is not an image, which is exactly
 * what it should keep doing. The duplicated part is the DNS guard, and
 * repeating it beats loosening the image fetcher's content-type check.
 */

const MAX_HTML_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;

function assertPublicIp(address: string): void {
  if (ipaddr.process(address).range() !== "unicast") {
    throw new Error("That address is not reachable.");
  }
}

async function pinnedDispatcher(hostname: string): Promise<Agent> {
  const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) throw new Error("That domain did not resolve.");
  records.forEach(({ address }) => assertPublicIp(address));
  const [selected] = records;
  return new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        if (options?.all) callback(null, [{ address: selected.address, family: selected.family }]);
        else callback(null, selected.address, selected.family as 4 | 6);
      },
    },
  });
}

/**
 * Fetches a page's HTML under the SSRF rules above. Exported because the
 * directory's badge check needs the same guarantees: it also fetches a URL
 * a stranger supplied, and it would be the same hole written twice.
 */
export async function fetchSafeHtml(rawUrl: string): Promise<{ html: string; finalUrl: URL }> {
  return fetchHtml(rawUrl);
}

async function fetchHtml(rawUrl: string): Promise<{ html: string; finalUrl: URL }> {
  let current = new URL(rawUrl);

  for (let hop = 0; hop <= 3; hop++) {
    if (!["http:", "https:"].includes(current.protocol)) {
      throw new Error("Only http and https links work here.");
    }
    if (current.username || current.password) {
      throw new Error("Remove the credentials from that link.");
    }

    const dispatcher = await pinnedDispatcher(current.hostname);
    try {
      const response = await request(current, {
        dispatcher,
        headersTimeout: TIMEOUT_MS,
        bodyTimeout: TIMEOUT_MS,
        headers: {
          // Named, with a contact URL: some sites block unknown agents, and
          // anyone wondering who is fetching them should be able to find out.
          "user-agent": BOT_USER_AGENT,
          accept: "text/html,application/xhtml+xml",
        },
      });

      if (response.statusCode >= 300 && response.statusCode < 400) {
        const location = response.headers.location;
        await response.body.dump();
        if (typeof location !== "string") throw new Error("That link redirects somewhere invalid.");
        current = new URL(location, current);
        continue;
      }
      if (response.statusCode !== 200) {
        await response.body.dump();
        throw new Error("That site did not return a page.");
      }

      const contentType = String(response.headers["content-type"] || "").toLowerCase();
      if (!contentType.includes("html")) {
        await response.body.dump();
        throw new Error("That link is not a web page.");
      }

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        // Metadata lives in the head, so a truncated document is still fine.
        if (size > MAX_HTML_BYTES) break;
        chunks.push(Buffer.from(chunk));
      }
      return { html: Buffer.concat(chunks).toString("utf8"), finalUrl: current };
    } finally {
      // destroy, not close: the error paths above throw without draining
      // the body, and close() would wait on it forever.
      await dispatcher.destroy();
    }
  }

  throw new Error("That link redirects too many times.");
}

/** Decodes the handful of HTML entities that actually turn up in title and
 * description tags. A full entity table is not worth it for text the
 * submitter is about to edit by hand anyway. */
function decodeEntities(input: string): string {
  return input
    .replace(/&(#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
      const key = entity.toLowerCase();
      if (key === "amp") return "&";
      if (key === "lt") return "<";
      if (key === "gt") return ">";
      if (key === "quot") return '"';
      if (key === "apos") return "'";
      if (key === "nbsp") return " ";
      if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
      if (key.startsWith("#")) return String.fromCodePoint(parseInt(key.slice(1), 10));
      return match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, attribute: "property" | "name", value: string): string | null {
  // Attribute order varies between sites, so find a meta tag carrying the
  // key and pull content out of it, rather than assuming content is second.
  const tagPattern = new RegExp(`<meta\\b[^>]*\\b${attribute}\\s*=\\s*["']${value}["'][^>]*>`, "i");
  const tag = html.match(tagPattern)?.[0];
  if (!tag) return null;
  const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content) : null;
}

export type SiteMetadata = {
  /** Best guess at the product's name, for the listing title. */
  name: string | null;
  /** One line, for the tagline field. */
  tagline: string | null;
  /** Longer copy, for the description field. */
  description: string | null;
  /** An absolute og:image URL, offered as a first screenshot. */
  image: string | null;
  /** The URL after redirects, so a pasted http link is stored as https. */
  url: string;
};

/**
 * The parsing half, split from the fetching half so it can be tested
 * without a network or a database (see test/siteMetadata.test.mjs). All the
 * guesswork about which tag means what lives here.
 */
export function parseSiteMetadata(html: string, finalUrl: URL): SiteMetadata {
  const ogTitle = metaContent(html, "property", "og:title");
  const siteName = metaContent(html, "property", "og:site_name");
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = titleTag ? decodeEntities(titleTag) : null;

  const ogDescription = metaContent(html, "property", "og:description");
  const metaDescription = metaContent(html, "name", "description");

  // og:site_name is the product's actual name far more often than <title>,
  // which tends to be "Name: a whole sentence about the product". Falling
  // back to the title, the part before a separator is the name often
  // enough to be a useful default.
  // The class covers a pipe, a hyphen, and the two long dashes other sites
  // put between a product name and its tagline. Those two are written as
  // escapes rather than as the characters themselves, to keep this file
  // free of literal long dashes per the project's writing rule.
  const name = siteName || (title ? title.split(/\s+[|\u2013\u2014-]\s+/)[0] : null) || ogTitle;

  // The longer of the two descriptions becomes the body; whichever short
  // line is left over becomes the tagline.
  const description =
    [ogDescription, metaDescription]
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => b.length - a.length)[0] ?? null;

  // A title is usually "Name | the actual tagline", and repeating the name
  // in the tagline field reads badly on a listing, so drop the prefix when
  // it is there. Stripe's og:title is literally "Stripe | Financial
  // Infrastructure to Grow Your Revenue"; the tagline is the half after
  // the separator.
  // Either end: Stripe puts the name first ("Stripe | Financial
  // Infrastructure..."), Notion puts it last ("The AI workspace that works
  // for you. | Notion"). Both read badly next to a Name field holding the
  // same word.
  const withoutName = (value: string): string => {
    if (!name) return value;
    const wanted = name.trim().toLowerCase();
    const match = value.match(/^(.*?)\s+[|:\u2013\u2014-]\s+(.*)$/);
    if (!match) return value;
    const [, before, after] = match;
    if (before.trim().toLowerCase() === wanted) return after.trim();
    if (after.trim().toLowerCase() === wanted) return before.trim();
    return value;
  };
  const rawTagline = ogTitle && ogTitle !== name ? ogTitle : metaDescription ?? ogDescription;
  const tagline = rawTagline ? withoutName(rawTagline) || null : null;

  let image: string | null = null;
  const rawImage = metaContent(html, "property", "og:image") || metaContent(html, "name", "twitter:image");
  if (rawImage) {
    try {
      const resolved = new URL(rawImage, finalUrl);
      if (["http:", "https:"].includes(resolved.protocol)) image = resolved.toString();
    } catch {
      // a malformed og:image is not worth failing the whole fetch over
    }
  }

  const trim = (value: string | null, max: number) =>
    value ? (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value) : null;

  return {
    name: trim(name, 80),
    tagline: trim(tagline, 120),
    description: trim(description, 600),
    image,
    url: finalUrl.toString(),
  };
}

/**
 * Best effort. Every field can come back null and the form still works:
 * this is a head start on typing, not a source of truth, and the submitter
 * edits all of it before anything is saved.
 */
export async function readSiteMetadata(rawUrl: string): Promise<SiteMetadata> {
  const { html, finalUrl } = await fetchHtml(rawUrl);
  return parseSiteMetadata(html, finalUrl);
}
