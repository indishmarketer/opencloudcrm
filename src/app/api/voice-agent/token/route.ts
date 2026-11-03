import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getSession, getSessionSecret } from "@/lib/auth";
import { isAuthorizedConsoleEmail } from "@/lib/consoleAdmins";
import { pool } from "@/lib/db";
import crypto from "node:crypto";

const VOICE_AGENT_WS_URL = process.env.VOICE_AGENT_WS_URL || "";
const SESSIONS_PER_USER_PER_DAY = Number(process.env.VOICE_SESSIONS_PER_USER_PER_DAY || 3);
const SESSION_MAX_SECONDS = Number(process.env.SESSION_MAX_SECONDS || 300);
const FISH_SAMPLE_RATE = Number(process.env.FISH_SAMPLE_RATE || 24000);

const secret = () => new TextEncoder().encode(getSessionSecret());

/** Mints a short-lived call-session token for the separate voice-agent-server
 * service (a standalone Node/WS process, not part of this Next.js app --
 * see voice-agent-server/ at repo root and departments/voice-agent.md).
 * Same SESSION_SECRET on both sides is what lets that service trust this
 * token without a second login system. */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const info = await pool.query(
      "SELECT 1 FROM voice_agent_business_profiles WHERE user_id = $1",
      [session.userId],
    );
    if (info.rowCount === 0) {
      return NextResponse.json({ error: "business_info_required" }, { status: 412 });
    }

    // Owner/invited console admins testing the demo shouldn't burn through
    // the same daily cap real visitors get -- checked against the same
    // owner-email + console_admins list the /console login already uses,
    // not a separate allowlist.
    const isAdmin = await isAuthorizedConsoleEmail(session.email);

    if (!isAdmin) {
      const used = await pool.query(
        `SELECT count(*)::int AS n FROM voice_sessions
         WHERE user_id = $1 AND started_at > now() - interval '24 hours'`,
        [session.userId],
      );
      if (used.rows[0].n >= SESSIONS_PER_USER_PER_DAY) {
        return NextResponse.json({ error: "quota_exceeded" }, { status: 429 });
      }
    }

    if (!VOICE_AGENT_WS_URL) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }

    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
    await pool.query(
      `INSERT INTO voice_call_tokens (jti, user_id, expires_at)
       VALUES ($1, $2, $3)`,
      [jti, session.userId, expiresAt],
    );

    const token = await new SignJWT({
      purpose: "voice-call",
      userId: session.userId,
      email: session.email,
      isAdmin,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(secret());

    const httpBase = VOICE_AGENT_WS_URL
      .replace(/^wss:/, "https:")
      .replace(/^ws:/, "http:");

    return NextResponse.json({
      token,
      wsUrl: `${VOICE_AGENT_WS_URL}/call?token=${token}`,
      sttTokenUrl: `${httpBase}/stt-token`,
      sampleRate: FISH_SAMPLE_RATE,
      maxSeconds: SESSION_MAX_SECONDS,
    });
  } catch (err: unknown) {
    console.error("[voice-agent token POST]", err);
    return NextResponse.json(
      { error: "Could not start a voice-agent session right now." },
      { status: 500 },
    );
  }
}
