/** Rotating signup CTAs shown on the public Prompt & Skill Library.
 * Owner's brief (2026-09-20, second pass -- first pass was a fixed bottom
 * banner, rejected): no fixed/floating banner anywhere. Instead two inline
 * surfaces: (1) a small card embedded directly in the page content (below
 * the copy button, between guide steps) so it reads as internal linking,
 * not an interruption, and (2) a popup that appears the moment someone
 * copies a prompt/skill, with a headline, subheadline, a thumbnail, and a
 * button -- rotating WHAT it offers (newsletter, courses, a call)
 * instead of always the same thing. */
export type SignupOffer = {
  headline: string;
  subheadline: string;
  buttonLabel: string;
  linkLabel: string;
  href: string;
  image: string;
};

import { assetUrl } from "@/config/brand";

const IMG_BASE = assetUrl("2026/09/offer");

export const SIGNUP_OFFERS: SignupOffer[] = [
  {
    headline: "Get automations like this every week",
    subheadline: "Free, practical breakdowns straight to your inbox, no fluff.",
    buttonLabel: "Join the newsletter",
    linkLabel: "Join the free newsletter",
    href: "/newsletter",
    image: `${IMG_BASE}-newsletter.webp`,
  },
  {
    headline: "Learn to build this yourself",
    subheadline: "Step-by-step courses on AI agents, automation, and real income streams.",
    buttonLabel: "Browse free courses",
    linkLabel: "Browse free courses",
    href: "/courses",
    image: `${IMG_BASE}-courses.webp`,
  },
  {
    headline: "Want this built for you?",
    subheadline: "A free discovery call to see if we're a good fit for your business.",
    buttonLabel: "Book a free call",
    linkLabel: "Book a free discovery call",
    href: "/book/discovery-call",
    image: `${IMG_BASE}-call.webp`,
  },
];

export function pickSignupOffer(): SignupOffer {
  return SIGNUP_OFFERS[Math.floor(Math.random() * SIGNUP_OFFERS.length)];
}
