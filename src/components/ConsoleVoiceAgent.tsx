"use client";

import { useState } from "react";
import BrandSelect from "@/components/BrandSelect";

const TEXT_PROVIDERS = [
  { value: "gemini", label: "Google Gemini (Default)" },
  { value: "openai", label: "OpenAI GPT" },
  { value: "pollinations", label: "Pollinations AI" },
];

const PRESET_TEXT_MODELS: Record<string, { value: string; label: string }[]> = {
  gemini: [
    { value: "gemini-2.5-flash", label: "gemini-2.5-flash (Fast, Recommended)" },
    { value: "gemini-2.5-pro", label: "gemini-2.5-pro" },
    { value: "gemini-1.5-flash", label: "gemini-1.5-flash" },
    { value: "gemini-1.5-pro", label: "gemini-1.5-pro" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "gpt-4o-mini (Fast, Recommended)" },
    { value: "gpt-4o", label: "gpt-4o" },
    { value: "gpt-3.5-turbo", label: "gpt-3.5-turbo" },
  ],
  pollinations: [
    { value: "openai", label: "openai (Default)" },
    { value: "mistral", label: "mistral" },
    { value: "claude-hybrid", label: "claude-hybrid" },
  ],
};

const TRANSCRIPTION_PROVIDERS = [
  { value: "assemblyai", label: "AssemblyAI v3 (Universal-3.5-pro)" },
];

// Only real options here. Two invented-looking preset IDs used to live in
// this list ("Professional Receptionist"/"Friendly Support") and neither
// existed on Fish Audio -- confirmed live, Fish returns {"event":"error",
// "error":"Reference not found"} for them, which the call pipeline used to
// swallow silently (fixed separately in tts.js), so picking one meant
// every reply's audio just vanished with no visible cause. Don't add a
// fake-looking preset ID back here -- either it's a real voice this
// account actually has, or it belongs in "Custom Reference ID" with the
// owner supplying the real value themselves.
const FISH_VOICE_PRESETS = [
  { value: "", label: "Default Voice (FISH_MODEL_ID env var)" },
  { value: "custom", label: "Custom Reference ID…" },
];

export type VoiceAgentSettings = {
  text_provider: string;
  text_model: string;
  transcription_provider: string;
  voice_model_id?: string;
};

export type SessionRow = {
  id: number;
  user_id: number;
  email: string;
  name: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  end_reason: string | null;
};

export type LeadRow = {
  id: number;
  session_id: number;
  user_id: number | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  summary: string | null;
  created_at: string;
};

export default function ConsoleVoiceAgent({
  initialSettings,
  initialSessions,
  initialLeads,
  initialError,
}: {
  initialSettings: VoiceAgentSettings;
  initialSessions: SessionRow[];
  initialLeads: LeadRow[];
  initialError?: string;
}) {
  const [textProvider, setTextProvider] = useState(initialSettings.text_provider || "gemini");
  const [textModel, setTextModel] = useState(initialSettings.text_model || "gemini-2.5-flash");
  const [customModel, setCustomModel] = useState("");
  const [isCustomModel, setIsCustomModel] = useState(
    !PRESET_TEXT_MODELS[initialSettings.text_provider || "gemini"]?.some(
      (m) => m.value === initialSettings.text_model
    )
  );

  const [transcriptionProvider, setTranscriptionProvider] = useState("assemblyai");

  const initialVoiceId = initialSettings.voice_model_id || "";
  const isPresetVoice = FISH_VOICE_PRESETS.some((v) => v.value === initialVoiceId && v.value !== "custom");
  const [voicePreset, setVoicePreset] = useState(isPresetVoice ? initialVoiceId : "custom");
  const [customVoiceId, setCustomVoiceId] = useState(isPresetVoice ? "" : initialVoiceId);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<"settings" | "sessions" | "leads">("settings");

  const [sessions, setSessions] = useState(initialSessions);
  const [leads, setLeads] = useState(initialLeads);
  const [selectedSessions, setSelectedSessions] = useState<Set<number>>(new Set());
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<"sessions" | "leads" | null>(null);

  function toggleSelected(set: Set<number>, id: number, setter: (s: Set<number>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  async function deleteSelected(resource: "sessions" | "leads") {
    const ids = Array.from(resource === "sessions" ? selectedSessions : selectedLeads);
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/console/voice-agent", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete");

      if (resource === "sessions") {
        setSessions((s) => s.filter((row) => !ids.includes(row.id)));
        setSelectedSessions(new Set());
        // Deleting a session cascades to its lead row (ON DELETE CASCADE),
        // so drop any now-orphaned leads from the local list too.
        setLeads((l) => l.filter((row) => !ids.includes(row.session_id)));
      } else {
        setLeads((l) => l.filter((row) => !ids.includes(row.id)));
        setSelectedLeads(new Set());
      }
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to delete." });
    } finally {
      setDeleting(false);
      setConfirmingDelete(null);
    }
  }

  function handleProviderChange(val: string) {
    setTextProvider(val);
    const presets = PRESET_TEXT_MODELS[val] || [];
    if (presets.length > 0) {
      setTextModel(presets[0].value);
      setIsCustomModel(false);
    } else {
      setIsCustomModel(true);
    }
  }

  function handleModelSelect(val: string) {
    if (val === "custom") {
      setIsCustomModel(true);
    } else {
      setIsCustomModel(false);
      setTextModel(val);
    }
  }

  function handleVoicePresetSelect(val: string) {
    setVoicePreset(val);
    if (val !== "custom") {
      setCustomVoiceId("");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const finalModel = (isCustomModel ? customModel : textModel).trim();
    if (!finalModel) {
      setMessage({ type: "error", text: "Text model name cannot be empty." });
      setSaving(false);
      return;
    }

    const finalVoiceId = (voicePreset === "custom" ? customVoiceId : voicePreset).trim();

    try {
      const res = await fetch("/api/console/voice-agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text_provider: textProvider,
          text_model: finalModel,
          transcription_provider: transcriptionProvider,
          voice_model_id: finalVoiceId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to save settings");
      }

      setMessage({
        type: "success",
        text: "Voice agent settings saved! Active models take effect immediately on the next call without redeployment.",
      });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    } finally {
      setSaving(false);
    }
  }

  const modelOptions = [
    ...(PRESET_TEXT_MODELS[textProvider] || []),
    { value: "custom", label: "Custom model ID…" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Voice Agent Control</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Configure real-time LLM, TTS, and STT providers. Settings are read fresh from Postgres on every call turn — no code redeploy required.
        </p>
      </div>

      {initialError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {initialError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-line pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`pb-2 text-sm font-medium transition-colors ${
            activeTab === "settings"
              ? "border-b-2 border-ink text-ink"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          Model Settings
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("sessions")}
          className={`pb-2 text-sm font-medium transition-colors ${
            activeTab === "sessions"
              ? "border-b-2 border-ink text-ink"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          Recent Sessions ({sessions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("leads")}
          className={`pb-2 text-sm font-medium transition-colors ${
            activeTab === "leads"
              ? "border-b-2 border-ink text-ink"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          Lead Summaries ({leads.length})
        </button>
      </div>

      {activeTab === "settings" && (
        <form onSubmit={handleSave} className="max-w-2xl space-y-6">
          {message && (
            <div
              className={`rounded-xl p-4 text-sm ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Text Provider / LLM */}
          <div className="rounded-2xl border border-line bg-paper p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold">1. Text Generation (LLM)</h2>
            <p className="text-xs text-ink-soft">
              Select the LLM provider for conversational turns. Gemini is fast and handles streaming clause-splitting with ultra-low latency.
            </p>

            <div>
              <label className="text-sm font-medium">Provider</label>
              <div className="mt-1">
                <BrandSelect
                  value={textProvider}
                  onChange={handleProviderChange}
                  options={TEXT_PROVIDERS}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Model</label>
              <div className="mt-1">
                <BrandSelect
                  value={isCustomModel ? "custom" : textModel}
                  onChange={handleModelSelect}
                  options={modelOptions}
                />
              </div>
            </div>

            {isCustomModel && (
              <div>
                <label className="text-xs font-medium text-ink-soft">Custom Model Identifier</label>
                <input
                  type="text"
                  value={customModel || textModel}
                  onChange={(e) => {
                    setCustomModel(e.target.value);
                    setTextModel(e.target.value);
                  }}
                  placeholder="e.g. gemini-2.5-flash or gpt-4o-mini"
                  className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>
            )}
          </div>

          {/* Speech-to-Text / STT */}
          <div className="rounded-2xl border border-line bg-paper p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold">2. Speech-to-Text (Transcription)</h2>
            <p className="text-xs text-ink-soft">
              Select the real-time transcription service. AssemblyAI mints client tokens on demand to stream direct WebSocket audio from the browser.
            </p>

            <div>
              <label className="text-sm font-medium">STT Provider</label>
              <div className="mt-1">
                <BrandSelect
                  value={transcriptionProvider}
                  onChange={setTranscriptionProvider}
                  options={TRANSCRIPTION_PROVIDERS}
                />
              </div>
            </div>
          </div>

          {/* Text-to-Speech / TTS */}
          <div className="rounded-2xl border border-line bg-paper p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold">3. Voice Synthesis (Fish Audio TTS)</h2>
            <p className="text-xs text-ink-soft">
              Voice output runs via Fish Audio live-TTS (24kHz PCM msgpack). You can pick a reference voice preset or provide a custom Fish Audio model reference ID.
            </p>

            <div>
              <label className="text-sm font-medium">Voice Model</label>
              <div className="mt-1">
                <BrandSelect
                  value={voicePreset}
                  onChange={handleVoicePresetSelect}
                  options={FISH_VOICE_PRESETS}
                />
              </div>
            </div>

            {voicePreset === "custom" && (
              <div>
                <label className="text-xs font-medium text-ink-soft">Custom Fish Audio Reference ID</label>
                <input
                  type="text"
                  value={customVoiceId}
                  onChange={(e) => setCustomVoiceId(e.target.value)}
                  placeholder="e.g. 80caab923f6c40689b740578e3fb3d03"
                  className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink font-mono text-xs"
                />
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {saving ? "Saving Changes…" : "Save Model Settings"}
            </button>
          </div>
        </form>
      )}

      {activeTab === "sessions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={sessions.length > 0 && selectedSessions.size === sessions.length}
                onChange={(e) =>
                  setSelectedSessions(e.target.checked ? new Set(sessions.map((s) => s.id)) : new Set())
                }
              />
              Select all
            </label>
            {selectedSessions.size > 0 && (
              <div className="flex items-center gap-2">
                {confirmingDelete === "sessions" ? (
                  <>
                    <span className="text-xs text-ink-soft">Delete {selectedSessions.size} session(s)?</span>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => deleteSelected("sessions")}
                      className="rounded-full border border-red-600 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Confirm delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(null)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft hover:border-ink"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete("sessions")}
                    className="rounded-full border border-red-600 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Delete selected ({selectedSessions.size})
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-paper-soft text-xs text-ink-soft uppercase tracking-wider">
                <tr>
                  <th className="w-8 px-4 py-3" />
                  <th className="px-4 py-3">Session ID</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">End Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-ink-soft">
                      No call sessions recorded yet.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-paper-soft/50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedSessions.has(s.id)}
                          onChange={() => toggleSelected(selectedSessions, s.id, setSelectedSessions)}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-soft">#{s.id}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{s.name || s.email}</p>
                        {s.name && <p className="text-xs text-ink-soft">{s.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-soft">
                        {new Date(s.started_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {s.duration_seconds != null ? `${s.duration_seconds}s` : "Active / Incomplete"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="rounded-full bg-paper-soft px-2 py-0.5 text-xs text-ink-soft font-mono">
                          {s.end_reason || "in-progress"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "leads" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={leads.length > 0 && selectedLeads.size === leads.length}
                onChange={(e) => setSelectedLeads(e.target.checked ? new Set(leads.map((l) => l.id)) : new Set())}
              />
              Select all
            </label>
            {selectedLeads.size > 0 && (
              <div className="flex items-center gap-2">
                {confirmingDelete === "leads" ? (
                  <>
                    <span className="text-xs text-ink-soft">Delete {selectedLeads.size} summary(ies)?</span>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => deleteSelected("leads")}
                      className="rounded-full border border-red-600 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Confirm delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(null)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft hover:border-ink"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete("leads")}
                    className="rounded-full border border-red-600 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Delete selected ({selectedLeads.size})
                  </button>
                )}
              </div>
            )}
          </div>

          {leads.length === 0 ? (
            <div className="rounded-2xl border border-line bg-paper p-8 text-center text-ink-soft text-sm">
              No call summaries yet.
            </div>
          ) : (
            leads.map((l) => (
              <div key={l.id} className="rounded-2xl border border-line bg-paper p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1.5"
                      checked={selectedLeads.has(l.id)}
                      onChange={() => toggleSelected(selectedLeads, l.id, setSelectedLeads)}
                    />
                    <div>
                      <h3 className="font-display font-semibold text-ink">
                        {l.name || "Anonymous caller"} {l.company ? `(${l.company})` : ""}
                      </h3>
                      <p className="text-xs text-ink-soft">
                        {l.email || "No email"} {l.phone ? `· ${l.phone}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-ink-soft">
                    {new Date(l.created_at).toLocaleString()}
                  </span>
                </div>

                <p className="text-sm text-ink">{l.summary || "No summary available for this call."}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
