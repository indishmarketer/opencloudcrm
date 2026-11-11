import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyOtpToken } from "@/lib/otp";
import {
  completeNewsletterVerification,
  completeContactVerification,
  completeGuideVerification,
  type ContactPayload,
  type GuidePayload,
} from "@/lib/otpCompletion";
import { SITE_URL } from "@/lib/siteMeta";
import { getFormById } from "@/lib/forms";
import { completeFormSubmission, FORM_SUBMIT_PURPOSE_PREFIX } from "@/lib/formSubmission";

/** Completes whichever purpose a magic link belongs to. Only reachable via
 * POST (a real click on the confirm page's button), never GET -- so a
 * link-prefetching security scanner (Microsoft Defender Safe Links,
 * Proofpoint, etc.) loading the /verify page on the user's behalf can't
 * silently burn the token before the user acts.
 *
 * Redirect targets are built from SITE_URL, never from req.url -- behind
 * Coolify's reverse proxy, req.url resolves to the container's internal
 * bind address (0.0.0.0:3000), not the public domain, so new URL(path,
 * req.url) silently produces an unreachable Location header. The browser
 * can't navigate there and just does nothing, with no visible error. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`verify-link:${ip}`, 20, 10 * 60 * 1000))) {
    return NextResponse.redirect(new URL("/verify?error=1", SITE_URL), { status: 303 });
  }

  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") || "");
  if (!token) return NextResponse.redirect(new URL("/verify?error=1", SITE_URL), { status: 303 });

  const result = await verifyOtpToken(token);
  if (!result) {
    return NextResponse.redirect(new URL("/verify?error=1", SITE_URL), { status: 303 });
  }

  if (result.purpose === "newsletter") {
    await completeNewsletterVerification(result.email, result.payload);
  } else if (result.purpose === "contact") {
    if (!result.payload) {
      return NextResponse.redirect(new URL("/verify?error=1", SITE_URL), { status: 303 });
    }
    await completeContactVerification(result.email, result.payload as unknown as ContactPayload);
  } else if (result.purpose.startsWith(FORM_SUBMIT_PURPOSE_PREFIX)) {
    // A saved form with email verification on. Until this branch existed, the
    // magic link in a form's own verification email always failed -- the
    // purpose fell through to the error redirect below, so the only way to
    // finish was to go back to the original tab and type the code.
    const formId = Number(result.purpose.slice(FORM_SUBMIT_PURPOSE_PREFIX.length));
    const payload = result.payload as
      | { fields?: Record<string, string>; pageUrl?: string; attribution?: Record<string, string | null>; ipCountry?: string | null }
      | null;
    if (!Number.isInteger(formId) || !payload?.fields) {
      return NextResponse.redirect(new URL("/verify?error=1", SITE_URL), { status: 303 });
    }
    const form = await getFormById(formId);
    if (!form || form.isFixed) {
      return NextResponse.redirect(new URL("/verify?error=1", SITE_URL), { status: 303 });
    }
    await completeFormSubmission({
      form,
      values: payload.fields,
      pageUrl: payload.pageUrl || "",
      verifiedEmail: result.email,
      attribution: payload.attribution,
      ipCountry: payload.ipCountry,
    });
    if (form.submissionAction === "redirect" && form.redirectUrl) {
      return NextResponse.redirect(new URL(form.redirectUrl, SITE_URL), { status: 303 });
    }
    return NextResponse.redirect(new URL(`/verify?done=1&purpose=form&form=${form.id}`, SITE_URL), { status: 303 });
  } else if (result.purpose === "guide") {
    if (!result.payload) {
      return NextResponse.redirect(new URL("/verify?error=1", SITE_URL), { status: 303 });
    }
    const slug = await completeGuideVerification(result.email, result.payload as unknown as GuidePayload);
    if (!slug) return NextResponse.redirect(new URL("/verify?error=1", SITE_URL), { status: 303 });
    return NextResponse.redirect(new URL(`/guide/${slug}?unlocked=1`, SITE_URL), { status: 303 });
  } else {
    return NextResponse.redirect(new URL("/verify?error=1", SITE_URL), { status: 303 });
  }

  return NextResponse.redirect(new URL(`/verify?done=1&purpose=${result.purpose}`, SITE_URL), { status: 303 });
}
