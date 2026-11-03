import dns from "node:dns";
import ipaddr from "ipaddr.js";
import { Agent, request } from "undici";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE } from "@/lib/imagePolicy";

function assertPublicIp(address: string): void {
  const parsed = ipaddr.process(address);
  if (parsed.range() !== "unicast") {
    throw new Error("Private or reserved network destinations are not allowed.");
  }
}

export function createPinnedImageDispatcher(address: string, family: 4 | 6): Agent {
  return new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        if (options?.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      },
    },
  });
}

async function pinnedDispatcher(hostname: string): Promise<Agent> {
  const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) throw new Error("Remote host did not resolve.");
  records.forEach(({ address }) => assertPublicIp(address));

  const selected = records[0];
  return createPinnedImageDispatcher(selected.address, selected.family as 4 | 6);
}

export async function fetchSafeRemoteImage(
  rawUrl: string,
  maximumBytes = MAX_IMAGE_SIZE,
): Promise<{ bytes: Buffer; contentType: string }> {
  let current = new URL(rawUrl);

  for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
    if (!['http:', 'https:'].includes(current.protocol)) {
      throw new Error("Only HTTP and HTTPS image URLs are allowed.");
    }
    if (current.username || current.password) {
      throw new Error("URLs containing credentials are not allowed.");
    }

    const dispatcher = await pinnedDispatcher(current.hostname);
    try {
      const response = await request(current, {
        dispatcher,
        headersTimeout: 8_000,
        bodyTimeout: 8_000,
        headers: { "user-agent": "IndishMarketer-ImageFetcher/1.0" },
      });

      if (response.statusCode >= 300 && response.statusCode < 400) {
        const location = response.headers.location;
        await response.body.dump();
        if (typeof location !== "string") throw new Error("Invalid redirect.");
        current = new URL(location, current);
        continue;
      }

      if (response.statusCode !== 200) throw new Error("Remote server rejected the image request.");

      const contentType = String(response.headers["content-type"] || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (!ALLOWED_IMAGE_TYPES[contentType]) throw new Error("Remote content is not an allowed image.");

      const declaredLength = Number(response.headers["content-length"]);
      if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
        throw new Error("Remote image is too large.");
      }

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maximumBytes) throw new Error("Remote image is too large.");
        chunks.push(Buffer.from(chunk));
      }
      if (size === 0) throw new Error("Remote image is empty.");

      return { bytes: Buffer.concat(chunks), contentType };
    } finally {
      // destroy, not close: close() waits for every response body to be
      // read, and the error paths above throw without reading it (a 404
      // page instead of an icon), which left the request hanging forever.
      await dispatcher.destroy();
    }
  }

  throw new Error("Too many redirects.");
}
