import { isWhatsAppManagementConfigured } from "@/lib/whatsappTemplates";
import { getRazorpayKeyId } from "@/lib/razorpay";
import { getPaypalClientId } from "@/lib/paypal";

/** Server-only. Whether each optional integration is actually configured
 * in this deployment -- the single place that answers "is X on", reusing
 * each module's own existing check rather than re-deriving it, so there's
 * one definition per module instead of two that can drift. Every
 * user-facing surface for an optional module (console nav, console pages,
 * public marketing pages, the legal pages' vendor disclosure) should read
 * from here rather than checking its own env vars inline.
 *
 * Never import this from a "use client" component -- it's computed from
 * secret env vars (API keys, tokens) that must never reach the browser
 * bundle. A client component that needs one of these flags gets it as a
 * prop from a server-component parent instead. */
export const FEATURES = {
  whatsapp: isWhatsAppManagementConfigured(),
  voiceAgent: Boolean(process.env.VOICE_AGENT_WS_URL),
  razorpay: Boolean(getRazorpayKeyId()),
  paypal: Boolean(getPaypalClientId()),
  email: Boolean(process.env.SES_ACCESS_KEY_ID && process.env.SES_SECRET_ACCESS_KEY),
  cloudflare: Boolean(process.env.CLOUDFLARE_ZONE_TOKEN && process.env.CLOUDFLARE_ZONE_ID),
} as const;
