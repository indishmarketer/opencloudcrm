import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

const ALLOWED_KEYS = new Set([
  "text_provider",
  "text_model",
  "transcription_provider",
  "voice_model_id",
]);

const VALID_TEXT_PROVIDERS = new Set(["gemini", "openai", "pollinations"]);
const VALID_TRANSCRIPTION_PROVIDERS = new Set(["assemblyai"]);

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [settingsRes, sessionsRes, leadsRes] = await Promise.all([
      pool.query("SELECT key, value, updated_at FROM voice_agent_settings"),
      pool.query(`
        SELECT s.id, s.user_id, u.email, u.name, s.started_at, s.ended_at, s.duration_seconds, s.end_reason
        FROM voice_sessions s
        JOIN users u ON u.id = s.user_id
        ORDER BY s.started_at DESC
        LIMIT 50
      `),
      pool.query(`
        SELECT l.id, l.session_id, l.user_id, l.name, l.email, l.phone, l.company, l.summary, l.created_at
        FROM voice_leads l
        ORDER BY l.created_at DESC
        LIMIT 50
      `),
    ]);

    const settings: Record<string, string> = {
      text_provider: "gemini",
      text_model: "gemini-2.5-flash",
      transcription_provider: "assemblyai",
      voice_model_id: "",
    };

    for (const row of settingsRes.rows) {
      settings[row.key] = row.value;
    }

    // AssemblyAI is the only STT provider currently wired into the live call pipeline.
    settings.transcription_provider = "assemblyai";

    return NextResponse.json({
      settings,
      recentSessions: sessionsRes.rows,
      recentLeads: leadsRes.rows,
    });
  } catch (err: unknown) {
    console.error("[voice-agent settings GET]", err);
    return NextResponse.json({ error: "Failed to load voice agent data" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const updates: { key: string; value: string }[] = [];

    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED_KEYS.has(k)) continue;
      if (typeof v !== "string") continue;
      const strVal = v.trim();

      if (k === "text_model" && (!strVal || strVal.length > 100)) {
        return NextResponse.json({ error: "Invalid text model" }, { status: 400 });
      }
      if (k === "voice_model_id" && strVal.length > 128) {
        return NextResponse.json({ error: "Invalid voice model ID" }, { status: 400 });
      }

      if (k === "text_provider" && !VALID_TEXT_PROVIDERS.has(strVal)) {
        return NextResponse.json({ error: `Invalid text provider: ${strVal}` }, { status: 400 });
      }
      if (k === "transcription_provider" && !VALID_TRANSCRIPTION_PROVIDERS.has(strVal)) {
        return NextResponse.json({ error: `Invalid transcription provider: ${strVal}` }, { status: 400 });
      }

      updates.push({ key: k, value: strVal });
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No valid settings provided" }, { status: 400 });
    }

    for (const update of updates) {
      await pool.query(
        `INSERT INTO voice_agent_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
        [update.key, update.value]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[voice-agent settings PATCH]", err);
    return NextResponse.json({ error: "Failed to update voice agent settings" }, { status: 500 });
  }
}

/** Deletes recorded call sessions or lead summaries -- owner's request
 * (2026-08-22): both lists need to be prunable from the console so the
 * database doesn't just accumulate forever. Deleting a session cascades
 * to its lead row too (voice_leads.session_id has ON DELETE CASCADE, see
 * migration 029), so deleting from "sessions" can also clear a summary. */
export async function DELETE(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => null);
    const resource = body?.resource;
    const ids = body?.ids;

    if (resource !== "sessions" && resource !== "leads") {
      return NextResponse.json({ error: "resource must be 'sessions' or 'leads'" }, { status: 400 });
    }
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(id))) {
      return NextResponse.json({ error: "ids must be a non-empty array of integers" }, { status: 400 });
    }

    const table = resource === "sessions" ? "voice_sessions" : "voice_leads";
    const result = await pool.query(`DELETE FROM ${table} WHERE id = ANY($1::int[])`, [ids]);

    return NextResponse.json({ ok: true, deleted: result.rowCount });
  } catch (err: unknown) {
    console.error("[voice-agent settings DELETE]", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
