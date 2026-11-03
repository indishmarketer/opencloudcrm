// Mints a single-use, short-lived AssemblyAI streaming token so the real
// API key never reaches the browser. The browser connects DIRECTLY to
// AssemblyAI with this token (see call.js) -- audio never transits this
// server, which is why the container can stay small. Ported from the
// reference repo's app/stt.py.
const AAI_TOKEN_URL = "https://streaming.assemblyai.com/v3/token";

export async function mintAssemblyAiToken() {
  const url = new URL(AAI_TOKEN_URL);
  url.searchParams.set("expires_in_seconds", "60");
  url.searchParams.set("max_session_duration_seconds", "180");

  const res = await fetch(url, {
    headers: { Authorization: process.env.ASSEMBLYAI_API_KEY }, // no "Bearer" prefix, per AssemblyAI's own token endpoint
  });
  if (!res.ok) {
    throw new Error(`AssemblyAI token mint failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.token;
}

export function assemblyAiWsUrl(token) {
  const url = new URL("wss://streaming.assemblyai.com/v3/ws");
  url.searchParams.set("token", token);
  url.searchParams.set("sample_rate", "16000");
  url.searchParams.set("encoding", "pcm_s16le");
  url.searchParams.set("speech_model", process.env.AAI_SPEECH_MODEL || "universal-3-5-pro");
  url.searchParams.set("format_turns", "true");
  url.searchParams.set("end_of_turn_confidence_threshold", "0.4");
  url.searchParams.set("min_turn_silence", "400");
  url.searchParams.set("max_turn_silence", "1100");
  return url.toString();
}
