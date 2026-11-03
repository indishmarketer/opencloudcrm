import { generateText } from "./llm.js";
import { getSettings, pool } from "./db.js";
import { z } from "zod";

const LeadSchema = z.object({
  name: z.string().trim().max(200).nullable(),
  email: z.string().trim().email().max(320).nullable(),
  phone: z.string().trim().max(40).nullable(),
  company: z.string().trim().max(200).nullable(),
  summary: z.string().trim().max(1000).nullable(),
}).strict();

const EXTRACTION_SYSTEM_PROMPT = `You are a data extraction assistant. Analyze the conversation transcript between a user and a voice receptionist.
Extract the user's contact information and a short summary into a JSON object.

Output MUST be a single valid JSON object with EXACTLY these keys:
{
  "name": string or null,
  "email": string or null,
  "phone": string or null,
  "company": string or null,
  "summary": string or null
}

Rules:
1. "name": The user's full or first name if stated.
2. "email": The user's email address. Convert spoken formats (e.g. "john dot doe at gmail dot com") to standard email format ("john.doe@gmail.com").
3. "phone": Phone number formatted cleanly if provided.
4. "company": The user's company or business name if mentioned.
5. "summary": 1-2 plain sentences covering what the caller wanted and how the call went -- enough for someone who never listened to the call to understand it at a glance. Not a transcript, not a list -- a short natural summary.
6. If any field was not mentioned or cannot be determined, set its value to null.
7. Output ONLY the JSON object. Do not wrap in markdown backticks or add explanation.`;

/** Regex fallback for spoken emails in transcripts: "name at domain dot com" */
export function extractSpokenEmail(text) {
  if (!text) return null;
  // Standard email match first
  const standardMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (standardMatch) return standardMatch[0];

  // Spoken match: e.g. "john at gmail dot com", "john . doe at example dot co dot in"
  const spokenMatch = text.match(/\b([a-zA-Z0-9_]+(?:\s*(?:dot|\.)\s*[a-zA-Z0-9_]+)*)\s*(?:at|@)\s*([a-zA-Z0-9-]+(?:\s*(?:dot|\.)\s*[a-zA-Z0-9-]+)+)\b/i);
  if (spokenMatch) {
    const userPart = spokenMatch[1].replace(/\s*(?:dot|\.)\s*/gi, ".");
    const domainPart = spokenMatch[2].replace(/\s*(?:dot|\.)\s*/gi, ".");
    const candidate = `${userPart}@${domainPart}`.toLowerCase();
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Regex fallback for phone numbers in transcripts */
export function extractPhoneNumber(text) {
  if (!text) return null;
  const match = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  return match ? match[0] : null;
}

/** Formats conversation history into a readable transcript string */
export function formatTranscript(history) {
  if (!Array.isArray(history) || history.length === 0) return "";
  return history
    .map((turn) => {
      const speaker = turn.role === "assistant" ? "Assistant" : "User";
      return `${speaker}: ${turn.text}`;
    })
    .join("\n");
}

/** Asynchronously extracts lead info and persists to voice_leads table */
export async function extractAndSaveLead({ sessionId, userId, history }) {
  try {
    const transcript = formatTranscript(history).slice(0, 50_000);
    if (!transcript.trim()) return null;

    // Filter user speech to see if user actually said anything
    const userUtterances = history
      .filter((t) => t.role === "user")
      .map((t) => t.text)
      .join(" ");

    if (!userUtterances.trim()) return null;

    const settings = await getSettings();
    const provider = settings.text_provider || "gemini";
    const model = settings.text_model || "gemini-2.5-flash";

    let leadData = {
      name: null,
      email: null,
      phone: null,
      company: null,
      summary: null,
    };

    try {
      const prompt = `Transcript:\n${transcript}\n\nExtract the JSON lead data:`;
      const rawOutput = await generateText(provider, model, EXTRACTION_SYSTEM_PROMPT, prompt);

      // Clean markdown code blocks if model wrapped it in ```json ... ```
      const cleaned = rawOutput.replace(/```json/gi, "").replace(/```/g, "").trim();
      leadData = LeadSchema.parse(JSON.parse(cleaned));
    } catch (llmErr) {
      console.warn("[voice-agent lead extraction] LLM extraction error, using fallback:", llmErr.message);
    }

    // Fallbacks if LLM missed email or phone
    if (!leadData.email) {
      leadData.email = extractSpokenEmail(userUtterances);
    }
    if (!leadData.phone) {
      leadData.phone = extractPhoneNumber(userUtterances);
    }

    // The console only ever displays the summary, not the raw transcript
    // (owner's request, 2026-08-22) -- transcript is still stored since
    // the summary is generated from it and re-extraction may need it
    // later, but nothing in the UI surfaces it anymore.
    const result = await pool.query(
      `INSERT INTO voice_leads (session_id, user_id, name, email, phone, company, summary, transcript, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       RETURNING id`,
      [
        sessionId,
        userId || null,
        leadData.name,
        leadData.email,
        leadData.phone,
        leadData.company,
        leadData.summary,
        transcript,
      ]
    );

    return result.rows[0]?.id || null;
  } catch (err) {
    console.error("[voice-agent lead extraction] Failed to extract or save lead:", err);
    return null;
  }
}
