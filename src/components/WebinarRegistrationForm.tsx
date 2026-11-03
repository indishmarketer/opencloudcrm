"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Turnstile from "@/components/Turnstile";
import UpdatesOptIn from "@/components/UpdatesOptIn";
import { trackEvent } from "@/lib/gtag";
import { SITE_NAME } from "@/config/brand";

export default function WebinarRegistrationForm({
  webinarId,
  webinarSlug,
  webinarTitle,
  signedIn,
  accessTier,
  autoJoin = false,
  upcomingSessions = [],
  scheduleTimeZone = "Asia/Kolkata",
  durationSeconds,
}: {
  webinarId: number;
  webinarSlug: string;
  webinarTitle: string;
  signedIn: boolean;
  accessTier: "free" | "pro";
  autoJoin?: boolean;
  upcomingSessions?: string[];
  scheduleTimeZone?: string;
  durationSeconds?: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [updatesOptIn, setUpdatesOptIn] = useState(true);
  const attendeeTimeZone = useSyncExternalStore(
    () => () => undefined,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || scheduleTimeZone,
    () => scheduleTimeZone,
  );
  const sessionStartAt = upcomingSessions[0] || "";
  const autoJoinAttempted = useRef(false);
  const roomUrl = `/webinars/${webinarSlug}/room`;

  const joinRoom = useCallback(async () => {
    if (!signedIn || busy) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/webinars/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webinarId, slug: webinarSlug, attendeeTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || scheduleTimeZone }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "We could not open the webinar room. Please try again.");
      setBusy(false);
      return;
    }
    trackEvent("webinar_register", { webinar_slug: webinarSlug, webinar_title: webinarTitle });
    router.replace(body.roomUrl || roomUrl);
    router.refresh();
  }, [busy, roomUrl, router, scheduleTimeZone, signedIn, webinarId, webinarSlug, webinarTitle]);

  useEffect(() => {
    if (autoJoin && signedIn && !autoJoinAttempted.current) {
      autoJoinAttempted.current = true;
      void joinRoom();
    }
  }, [autoJoin, joinRoom, signedIn]);

  async function registerGuest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!turnstileToken) return setError("Complete the human verification first.");
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const redirect = `/webinars/${webinarSlug}?join=1${sessionStartAt ? `&session=${encodeURIComponent(sessionStartAt)}` : ""}`;
    const response = await fetch("/api/webinars/register-guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webinarId,
        slug: webinarSlug,
        name: String(form.get("name") || ""),
        email,
        turnstileToken,
        redirect,
        updates_opt_in: updatesOptIn,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error || "We could not reserve your seat. Please try again.");
      return;
    }
    trackEvent("webinar_register", { webinar_slug: webinarSlug, webinar_title: webinarTitle, method: "guest_link" });
    setCheckEmail(email);
  }

  const nextBroadcast = sessionStartAt ? (() => { const start = new Date(sessionStartAt); const end = new Date(start.getTime() + Number(durationSeconds || 0) * 1000); const date = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: attendeeTimeZone }).format(start); const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: attendeeTimeZone, timeZoneName: "short" }); return <div className="rounded-xl border border-line bg-paper-soft p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Next live broadcast</p><p className="mt-2 text-sm font-semibold">{date}</p><p className="mt-1 text-sm text-ink-soft">{time.format(start)} to {time.format(end)}</p><p className="mt-2 text-xs leading-5 text-ink-soft">Times are shown in your timezone, {attendeeTimeZone}. Your seat is reserved for this next broadcast.</p></div>; })() : null;

  if (accessTier === "pro" && !signedIn) {
    return <div className="space-y-4">{nextBroadcast}<p className="text-sm leading-6 text-ink-soft">This webinar is included with PRO access.</p><Link href={`/login?redirect=${encodeURIComponent(`/webinars/${webinarSlug}?join=1`)}`} className="inline-flex w-full justify-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper">Sign in with PRO</Link></div>;
  }

  if (signedIn) {
    return <div className="space-y-4">{nextBroadcast}{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<button type="button" onClick={joinRoom} disabled={busy || !sessionStartAt} className="w-full rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-paper disabled:opacity-50">{busy ? "Reserving your seat..." : "Reserve your seat"}</button><p className="text-center text-xs text-ink-soft">Your existing {SITE_NAME} account will be used.</p></div>;
  }

  if (checkEmail) {
    return <div role="status" className="rounded-2xl border border-line bg-paper-soft p-5"><p className="font-semibold">Check your email to enter</p><p className="mt-2 text-sm leading-6 text-ink-soft">We sent a link to <strong className="text-ink">{checkEmail}</strong>. Click it and you&apos;ll go straight into the webinar &mdash; no password needed.</p></div>;
  }

  return <form onSubmit={registerGuest} className="space-y-4">
    {nextBroadcast}
    <div><label htmlFor={`webinar-name-${webinarId}`} className="text-sm font-medium">Name</label><input id={`webinar-name-${webinarId}`} name="name" autoComplete="name" required maxLength={200} className="mt-1.5 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink" /></div>
    <div><label htmlFor={`webinar-email-${webinarId}`} className="text-sm font-medium">Email</label><input id={`webinar-email-${webinarId}`} name="email" type="email" autoComplete="email" required maxLength={320} className="mt-1.5 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink" /><p className="mt-1 text-xs text-ink-soft">We&apos;ll email you a link to enter &mdash; no password to create.</p></div>
    <UpdatesOptIn checked={updatesOptIn} onChange={setUpdatesOptIn} />
    <Turnstile onToken={setTurnstileToken} />
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <button type="submit" disabled={busy || !turnstileToken} className="w-full rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-paper disabled:opacity-50">{busy ? "Reserving your seat..." : "Reserve your seat"}</button>
    <p className="text-center text-xs leading-5 text-ink-soft">Already have an account? <Link href={`/login?redirect=${encodeURIComponent(`/webinars/${webinarSlug}?join=1`)}`} className="font-medium text-ink underline">Log in</Link></p>
    <p className="text-center text-xs leading-5 text-ink-soft">By continuing, you agree to our <Link href="/terms" className="underline">terms</Link> and <Link href="/privacy-policy" className="underline">privacy policy</Link>.</p>
  </form>;
}
