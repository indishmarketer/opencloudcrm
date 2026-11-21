/** Popup and email presentation is code-owned. The console only chooses the
 * downloadable document, so changing a file can never rewrite public copy or
 * create an accidental indexable page. */
export const FREE_GUIDE_CONTENT = {
  badge: "Free guide",
  title: "How I Replaced My Whole Software Stack",
  headline: "How I replaced my whole software stack with one server, some API keys and an AI agent",
  subheadline:
    "I am not a developer. I still run my website, my courses, my emails, my WhatsApp and every automation behind them on one server I control. No Zapier. No n8n. No GoHighLevel. The 8 page guide shows you exactly how, in plain words.",
  /** What the reader gets, shown as a short list under the headline. */
  bullets: [
    "The three things you actually need, and what each one costs",
    "Every API I use, and what I really pay for them",
    "The exact first prompt to give your AI agent today",
  ],
  coverImageUrl: "/images/guide-panel.webp",
} as const;
