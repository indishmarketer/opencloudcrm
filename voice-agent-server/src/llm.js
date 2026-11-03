// Streaming text generation, provider-switchable. The active provider/model
// is read fresh from the DB on every turn (see db.js::getSettings) so the
// console panel (Vega, T-007) can change it live with no redeploy.

const MAX_REPLY_CHARS = Number(process.env.MAX_REPLY_CHARS || 500);

async function* geminiTokens(model, systemPrompt, history, userText) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;

  const contents = [
    ...history.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text: userText }] },
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: 300 },
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Gemini stream failed: ${res.status} ${await res.text()}`);
  }

  yield* sseTextDeltas(res.body, (json) => {
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === "string" ? text : "";
  });
}

async function* openaiTokens(model, systemPrompt, history, userText) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((turn) => ({ role: turn.role, content: turn.text })),
    { role: "user", content: userText },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: 300 }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`OpenAI stream failed: ${res.status} ${await res.text()}`);
  }

  yield* sseTextDeltas(res.body, (json) => json?.choices?.[0]?.delta?.content || "");
}

async function* pollinationsTokens(model, systemPrompt, history, userText) {
  const key = process.env.POLLINATIONS_API_KEY;
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((turn) => ({ role: turn.role, content: turn.text })),
    { role: "user", content: userText },
  ];

  // NOT text.pollinations.ai/openai -- that's the deprecated legacy host.
  // Confirmed live 2026-08-21: it silently degrades an authenticated key to
  // anonymous-tier behavior instead of rejecting the request outright, so
  // the failure shows up downstream as a confusing 402 ("API key budget
  // too low... this key has 0.0000") even on an account with real balance.
  // gen.pollinations.ai/v1/chat/completions is the current documented
  // OpenAI-compatible host (https://gen.pollinations.ai/docs) and is what
  // actually honors this key -- verified directly against the API before
  // making this change, not assumed.
  const res = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Pollinations stream failed: ${res.status} ${await res.text()}`);
  }

  yield* sseTextDeltas(res.body, (json) => json?.choices?.[0]?.delta?.content || "");
}

/** Parses an OpenAI-shaped `data: {...}` SSE byte stream into text deltas.
 * Gemini's SSE payload shape differs from OpenAI's but both are `data:
 * <json>\n\n` framed, so one parser with a pluggable extractor covers all
 * three providers. */
async function* sseTextDeltas(body, extract) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const text = extract(json);
        if (text) yield text;
      } catch {
        // partial/non-JSON keepalive line, ignore
      }
    }
  }
}

const PROVIDERS = { gemini: geminiTokens, openai: openaiTokens, pollinations: pollinationsTokens };

function tokenStream(provider, model, systemPrompt, history, userText) {
  const fn = PROVIDERS[provider];
  if (!fn) throw new Error(`Unknown text provider: ${provider}`);
  return fn(model, systemPrompt, history, userText);
}

/** Non-streaming text completion for tasks like lead extraction. */
export async function generateText(provider, model, systemPrompt, prompt) {
  let full = "";
  for await (const chunk of tokenStream(provider, model, systemPrompt, [], prompt)) {
    full += chunk;
  }
  return full;
}

/** Regroups a raw token stream into speakable clauses -- a sentence end
 * once at least 8 chars have built up, or a comma once 60 chars have
 * built up -- so TTS can start on the first clause instead of waiting for
 * the whole reply. Hard-caps total output at MAX_REPLY_CHARS. Ported from
 * the reference repo's app/llm.py::sentences/limit. */
export async function* sentences(provider, model, systemPrompt, history, userText) {
  let buffer = "";
  let total = 0;
  for await (const token of tokenStream(provider, model, systemPrompt, history, userText)) {
    if (total >= MAX_REPLY_CHARS) return;
    buffer += token;
    total += token.length;

    while (true) {
      const sentenceEnd = buffer.search(/[.!?](\s|$)/);
      const commaEnd = buffer.length >= 60 ? buffer.indexOf(",") : -1;

      let cut = -1;
      if (sentenceEnd >= 8) cut = sentenceEnd + 1;
      else if (commaEnd >= 0) cut = commaEnd + 1;

      if (cut === -1) break;
      const clause = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut);
      if (clause) yield clause;
    }

    if (total >= MAX_REPLY_CHARS) {
      const clipped = buffer.trim();
      if (clipped) yield clipped;
      return;
    }
  }
  const rest = buffer.trim();
  if (rest) yield rest;
}
