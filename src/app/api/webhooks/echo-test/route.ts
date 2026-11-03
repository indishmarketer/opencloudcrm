import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

/** A permanent, harmless self-test target the owner can point any outbound
 * webhook destination at to verify signing/delivery end-to-end without
 * depending on a third-party echo service. Accepts and discards the body,
 * never stores anything, always returns 200. Publicly reachable by design
 * (that's the point -- it has to be a real internet-routable HTTPS endpoint
 * for SSRF-safe delivery to succeed against it), so it's rate-limited per
 * IP to prevent abuse as an open relay/amplifier. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`webhook-echo-test:${ip}`, 60, 60 * 1000))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > 64 * 1024) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }
  await req.text().catch(() => {});
  return NextResponse.json({ ok: true, echo: true });
}
