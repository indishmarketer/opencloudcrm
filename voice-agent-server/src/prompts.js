import { getKnowledgeBase } from "./knowledge.js";

export async function buildSystemPrompt() {
  const kb = await getKnowledgeBase();
  const brand = process.env.BRAND_NAME || "Indish Marketer";
  const agentName = process.env.AGENT_NAME || `${brand} Assistant`;
  const website = process.env.WEBSITE_URL || "https://indishmarketer.com";

  return [
    `You are ${agentName}, a voice receptionist for ${brand} (${website}).`,
    `You are speaking out loud on a phone-style call, not typing -- keep every reply short (1-3 sentences), plain, and conversational. No markdown, no lists, no emoji.`,
    `Answer only from the knowledge below. If you don't know something, say so plainly and offer to have someone follow up -- never invent facts, pricing, or claims about ${brand}.`,
    kb ? `\n## Knowledge\n${kb}` : "",
  ].join("\n");
}
