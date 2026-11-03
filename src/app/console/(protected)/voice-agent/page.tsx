import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import ConsoleVoiceAgent, {
  type LeadRow,
  type SessionRow,
  type VoiceAgentSettings,
} from "@/components/ConsoleVoiceAgent";

export const metadata = {
  title: "Voice Agent Control | Console",
};

const DEFAULT_SETTINGS: VoiceAgentSettings = {
  text_provider: "gemini",
  text_model: "gemini-2.5-flash",
  transcription_provider: "assemblyai",
  voice_model_id: "",
};

export default async function ConsoleVoiceAgentPage() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) redirect("/console/login");

  const settings = { ...DEFAULT_SETTINGS };
  let sessions: SessionRow[] = [];
  let leads: LeadRow[] = [];
  let initialError = "";

  try {
    const [settingsRes, sessionsRes, leadsRes] = await Promise.all([
      pool.query("SELECT key, value FROM voice_agent_settings"),
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

    for (const row of settingsRes.rows) {
      if (typeof row.key === "string" && typeof row.value === "string") {
        settings[row.key as keyof VoiceAgentSettings] = row.value;
      }
    }

    // AssemblyAI is the only STT implementation currently wired into the
    // browser/service pipeline. Do not present a stored planned provider as live.
    settings.transcription_provider = "assemblyai";
    sessions = sessionsRes.rows;
    leads = leadsRes.rows;
  } catch (err: unknown) {
    console.error("[voice-agent console page]", err);
    initialError =
      "Voice-agent data could not be loaded. Confirm migrations 029, 030, and 031 have run, then retry.";
  }

  return (
    <ConsoleVoiceAgent
      initialSettings={settings}
      initialSessions={sessions}
      initialLeads={leads}
      initialError={initialError}
    />
  );
}