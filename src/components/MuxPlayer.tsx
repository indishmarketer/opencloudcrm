"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  playbackId: string;
  title?: string;
  autoPlay?: boolean;
  startTime?: number;
  lockedTime?: number;
  onTimeUpdate?: (seconds: number) => void;
};

export default function MuxPlayer({ playbackId, title, autoPlay = false, startTime = 0, lockedTime, onTimeUpdate }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [MuxPlayerReact, setMuxPlayerReact] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const fallbackRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [correctionTime, setCorrectionTime] = useState<number | undefined>();
  // A phone lock screen, backgrounded tab, or incoming call fires a native
  // pause the browser then refuses to auto-resume from without a fresh user
  // gesture -- the play() call below silently rejects in that case. Without
  // this, the video just sits stopped with no visible way to continue.
  const [needsResume, setNeedsResume] = useState(false);

  useEffect(() => {
    if (correctionTime === undefined) return;
    const timer = window.setTimeout(() => setCorrectionTime(undefined), 250);
    return () => window.clearTimeout(timer);
  }, [correctionTime]);

  useEffect(() => {
    if (lockedTime === undefined || !fallbackRef.current) return;
    if (Math.abs(fallbackRef.current.currentTime - lockedTime) > 1.5) fallbackRef.current.currentTime = lockedTime;
    if (fallbackRef.current.playbackRate !== 1) fallbackRef.current.playbackRate = 1;
  }, [lockedTime]);

  useEffect(() => {
    let cancelled = false;
    // Fetch a signed playback token/URL from our API so the playbackId isn't scrapable via static HTML.
    fetch(`/api/webinars/${encodeURIComponent(playbackId)}/playback-url`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, body: b })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok || !body.url) setError(body.error || "Could not load video.");
        else setSignedUrl(body.url);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load video.");
      });

    // Try to load the Mux Player React component dynamically. If unavailable, use <video>.
    import("@mux/mux-player-react")
      .then((mod) => {
        if (!cancelled && mod?.default) setMuxPlayerReact(() => mod.default as unknown as React.ComponentType<Record<string, unknown>>);
        else if (!cancelled && (mod as unknown as { MuxPlayer?: React.ComponentType<Record<string, unknown>> }).MuxPlayer) {
          setMuxPlayerReact(() => (mod as unknown as { MuxPlayer: React.ComponentType<Record<string, unknown>> }).MuxPlayer);
        }
      })
      .catch(() => {
        // stays null -> fallback <video> with hls.js not needed, native HLS may work in some browsers; we still have iframe fallback
      });

    return () => {
      cancelled = true;
    };
  }, [playbackId]);

  if (error) return <p className="text-sm text-red-600 p-4 border border-red-200 rounded-xl bg-red-50">{error}</p>;
  if (!signedUrl) return <div className="aspect-video w-full animate-pulse rounded-xl bg-line" />;

  const playerStyle = {
    width: "100%",
    aspectRatio: "16/9",
    // Mux Player officially supports hiding its complete control surface with
    // this variable. The room supplies its own mute-only control below.
    "--controls": "none",
  } as React.CSSProperties;
  const reportTime = (seconds: number) => {
    if (needsResume) setNeedsResume(false);
    if (lockedTime !== undefined && Math.abs(seconds - lockedTime) > 4) setCorrectionTime(lockedTime);
    onTimeUpdate?.(seconds);
  };
  const handlePause = (event: { currentTarget: HTMLVideoElement | null }) => {
    const el = event.currentTarget;
    if (!el) return;
    el.play().then(() => setNeedsResume(false)).catch(() => setNeedsResume(true));
  };
  const handleManualResume = () => fallbackRef.current?.play().then(() => setNeedsResume(false)).catch(() => undefined);
  const muteControl = <button type="button" onClick={() => setMuted((value) => !value)} className="absolute bottom-3 right-3 z-10 rounded-full border border-paper/35 bg-ink/80 px-3 py-2 text-xs font-semibold text-paper backdrop-blur hover:bg-ink" aria-label={muted ? "Turn sound on" : "Mute webinar"}>{muted ? "Unmute" : "Mute"}</button>;
  const resumeOverlay = needsResume ? (
    <button type="button" onClick={handleManualResume} className="absolute inset-0 z-20 flex items-center justify-center bg-ink/60 backdrop-blur-sm">
      <span className="rounded-full bg-paper px-6 py-3 text-sm font-semibold text-ink shadow-lg">Tap to resume</span>
    </button>
  ) : null;

  // If MuxPlayerReact loaded and we have a playbackId token situation, prefer it.
  // The signedUrl is like https://stream.mux.com/<id>.m3u8?token=...
  // For MuxPlayer we need playbackId + tokens.playback
  if (MuxPlayerReact) {
    let playerProps: Record<string, unknown> | null = null;

    try {
      const url = new URL(signedUrl);
      const token = url.searchParams.get("token");
      if (token) {
        playerProps = {
          playbackId,
          tokens: { playback: token },
          accentColor: "#000",
          style: playerStyle,
          metadata: title ? { video_title: title } : undefined,
          autoPlay,
          startTime,
          currentTime: correctionTime,
          muted,
          nohotkeys: true,
          ref: fallbackRef,
          onPause: (event: Event) => handlePause(event as unknown as { currentTarget: HTMLVideoElement | null }),
          onTimeUpdate: (event: Event) => reportTime(Number((event.currentTarget as HTMLVideoElement | null)?.currentTime || 0)),
        };
      } else if (signedUrl) {
        playerProps = {
          playbackId,
          src: signedUrl,
          accentColor: "#000",
          style: playerStyle,
          metadata: title ? { video_title: title } : undefined,
          autoPlay,
          startTime,
          currentTime: correctionTime,
          muted,
          nohotkeys: true,
          ref: fallbackRef,
          onPause: (event: Event) => handlePause(event as unknown as { currentTarget: HTMLVideoElement | null }),
          onTimeUpdate: (event: Event) => reportTime(Number((event.currentTarget as HTMLVideoElement | null)?.currentTime || 0)),
        };
      }
    } catch {
      // fallback
    }

    if (playerProps) {
      return <div className="relative"><MuxPlayerReact {...playerProps} />{muteControl}{resumeOverlay}</div>;
    }
  }

  // Fallback: plain video tag with HLS source (works in Safari; elsewhere needs hls.js but we keep simple and still branded)
  return (
    <div className="relative"><video
      ref={fallbackRef}
      playsInline
      style={{ width: "100%", aspectRatio: "16/9", background: "#000", borderRadius: "12px" }}
      src={signedUrl}
      title={title}
      autoPlay={autoPlay}
      muted={muted}
      onLoadedMetadata={(event) => { if (startTime > 0) event.currentTarget.currentTime = startTime; }}
      onSeeking={(event) => { if (lockedTime !== undefined && Math.abs(event.currentTarget.currentTime - lockedTime) > 1.5) event.currentTarget.currentTime = lockedTime; }}
      onRateChange={(event) => { if (event.currentTarget.playbackRate !== 1) event.currentTarget.playbackRate = 1; }}
      onPause={handlePause}
      onTimeUpdate={(event) => reportTime(event.currentTarget.currentTime)}
    />{muteControl}{resumeOverlay}</div>
  );
}
