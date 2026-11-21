/** Popup and email presentation is code-owned. The console only chooses the
 * downloadable document, so changing a file can never rewrite public copy or
 * create an accidental indexable page.
 *
 * The popup opens straight off the homepage hero, so it carries on from the
 * problem the hero states rather than restarting it. It leads with the cost
 * and the loss of control, which is what people actually feel, and keeps
 * servers and API keys off the first screen: those are the answer, and the
 * answer only sounds good to somebody who already wants the result. */
export const FREE_GUIDE_CONTENT = {
  badge: "Free guide",
  title: "How I Replaced My Whole Software Stack",
  headline: "How I replaced my monthly software bills with one system I actually own",
  subheadline:
    "I was paying for a CRM, an automation tool, an email tool and a few more every month, and I still could not change anything without permission. Now the whole business runs on one setup I control. I am not a developer, and this guide shows you exactly how I did it.",
  /** Results, not mechanics. The mechanics are inside the guide. */
  bullets: [
    "Swap a pile of monthly subscriptions for one small bill",
    "Own the system, so no tool can change the rules on you",
    "Set it up without learning to write code",
  ],
  coverImageUrl: "/images/guide-panel.webp",
} as const;
