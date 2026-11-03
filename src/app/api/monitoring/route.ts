import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

// Sentry's browser SDK is configured with `tunnel: "/api/monitoring"` (see
// src/instrumentation-client.ts) so error/performance envelopes go through
// our own domain instead of directly to *.sentry.io -- keeps CSP connect-src
// closed to third parties and avoids ad-blockers that filter direct Sentry
// requests. This route just forwards the envelope bytes to whatever ingest
// host the envelope itself names.
//
// The target host MUST be validated: the envelope's DSN header is
// client-controlled, so without this check any visitor could turn this
// route into an open SSRF relay to an arbitrary host by POSTing a crafted
// envelope.
const SENTRY_HOST_PATTERN = /(^|\.)sentry\.io$/;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`monitoring-tunnel:${ip}`, 60, 60 * 1000))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const envelope = await req.text().catch(() => "");
  const firstLine = envelope.split("\n", 1)[0];
  let dsn: URL;
  try {
    const header = JSON.parse(firstLine);
    dsn = new URL(String(header.dsn));
  } catch {
    return NextResponse.json({ error: "Invalid envelope." }, { status: 400 });
  }

  if (!SENTRY_HOST_PATTERN.test(dsn.hostname)) {
    return NextResponse.json({ error: "Unrecognized ingest host." }, { status: 400 });
  }

  // A Sentry project id is numeric. The host is already pinned, but the
  // path is just as client-controlled, and without this a crafted DSN
  // ("/..%2f..%2fsomething") could aim the forward at a different endpoint
  // on sentry.io rather than at an envelope ingest.
  const projectId = dsn.pathname.replace(/^\//, "");
  if (!/^\d+$/.test(projectId)) {
    return NextResponse.json({ error: "Invalid envelope." }, { status: 400 });
  }
  const ingestUrl = `https://${dsn.hostname}/api/${projectId}/envelope/`;

  try {
    const upstream = await fetch(ingestUrl, {
      method: "POST",
      body: envelope,
      headers: { "Content-Type": "application/x-sentry-envelope" },
    });
    return new NextResponse(null, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "Upstream unreachable." }, { status: 502 });
  }
}
