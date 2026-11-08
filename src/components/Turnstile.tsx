"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
    /** Set by the root layout from the live (non-NEXT_PUBLIC_, so never
     * frozen into the build) TURNSTILE_SITE_KEY env var -- see
     * src/app/layout.tsx. Read here (not at module scope) so the
     * server-rendered pass and the client's first paint agree: both see
     * it as unset until this effect runs, avoiding a hydration mismatch. */
    __TURNSTILE_SITE_KEY__?: string;
  }
}

export default function Turnstile({
  onToken,
  dark = false,
}: {
  onToken: (token: string) => void;
  /** True when this widget sits directly on a dark section background --
   * the status text (ink-soft/ink) is otherwise unreadable on dark. */
  dark?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [siteKey, setSiteKey] = useState<string | undefined>(undefined);

  useEffect(() => {
    setSiteKey(window.__TURNSTILE_SITE_KEY__ || undefined);
  }, []);

  useEffect(() => {
    if (!siteKey) return;

    function render() {
      if (!window.turnstile || !ref.current || rendered.current) return;
      rendered.current = true;
      window.turnstile.render(ref.current, {
        sitekey: siteKey!,
        callback: (t) => {
          setState("ready");
          onToken(t);
        },
        "error-callback": () => {
          setState("error");
          onToken("");
        },
        "expired-callback": () => {
          setState("error");
          onToken("");
        },
      });
    }

    if (window.turnstile) {
      render();
    } else {
      const existing = document.getElementById("cf-turnstile-script");
      if (!existing) {
        const script = document.createElement("script");
        script.id = "cf-turnstile-script";
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        script.async = true;
        script.onload = render;
        script.onerror = () => setState("error");
        document.head.appendChild(script);
      } else {
        existing.addEventListener("load", render);
      }
    }
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return (
    <div>
      <div ref={ref} />

      {state === "loading" && (
        <div className="mt-2.5 flex items-center gap-2.5">
          {/* 3D Loading Spinner */}
          <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
            <svg className="h-6 w-6 drop-shadow-sm" viewBox="0 0 40 40" fill="none">
              <defs>
                <linearGradient id="rim-light" x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#e2e2e0" />
                  <stop offset="100%" stopColor="#d1d1cf" />
                </linearGradient>
              </defs>
              <polygon
                points="20,2 36.6,11 36.6,29 20,38 3.4,29 3.4,11"
                stroke="url(#rim-light)"
                strokeWidth="3.5"
                fill="none"
              />
              <polygon
                points="20,2 36.6,11 36.6,29 20,38 3.4,29 3.4,11"
                stroke="#0a0a0a"
                strokeWidth="3.5"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="105"
                strokeDashoffset="70"
                style={{ animation: "turnstile-dash 1.8s ease-in-out infinite, turnstile-spin 1.8s linear infinite", transformOrigin: "50% 50%" }}
              />
            </svg>
          </div>
          <p className={`text-xs ${dark ? "text-white/70" : "text-ink-soft"}`}>Verifying you&apos;re human&hellip;</p>
        </div>
      )}

      {state === "ready" && (
        <div className="mt-2.5 flex items-center gap-2.5">
          {/* 3D Verified Badge */}
          <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
            <svg className="h-6 w-6 drop-shadow-md" viewBox="0 0 40 40" fill="none">
              <defs>
                <linearGradient id="badge-rim" x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#4b4b4b" />
                  <stop offset="100%" stopColor="#0a0a0a" />
                </linearGradient>
                <linearGradient id="badge-face" x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#262626" />
                  <stop offset="100%" stopColor="#000000" />
                </linearGradient>
              </defs>
              <polygon points="20,2 36.6,11 36.6,29 20,38 3.4,29 3.4,11" fill="url(#badge-rim)" />
              <polygon points="20,4.5 34.6,12.5 34.6,27.5 20,35.5 5.4,27.5 5.4,12.5" fill="url(#badge-face)" />
              
              <polyline
                points="12.5,20 17.5,25.5 27.5,14"
                stroke="#ffffff"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray="28"
                strokeDashoffset="28"
                style={{ animation: "turnstile-check 0.4s ease-out 0.15s forwards" }}
              />
            </svg>
          </div>
          <p className={`text-xs font-medium ${dark ? "text-white" : "text-ink"}`}>Verified</p>
        </div>
      )}

      {state === "error" && (
        <div className="mt-2.5 flex items-center gap-2.5">
          {/* 3D Error Badge */}
          <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
            <svg className="h-6 w-6 drop-shadow-md" viewBox="0 0 40 40" fill="none">
              <defs>
                <linearGradient id="badge-rim-err" x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#f87171" />
                  <stop offset="100%" stopColor="#dc2626" />
                </linearGradient>
                <linearGradient id="badge-face-err" x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="100%" stopColor="#991b1b" />
                </linearGradient>
              </defs>
              <polygon points="20,2 36.6,11 36.6,29 20,38 3.4,29 3.4,11" fill="url(#badge-rim-err)" />
              <polygon points="20,4.5 34.6,12.5 34.6,27.5 20,35.5 5.4,27.5 5.4,12.5" fill="url(#badge-face-err)" />
              
              <line x1="14.5" y1="14.5" x2="25.5" y2="25.5" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
              <line x1="25.5" y1="14.5" x2="14.5" y2="25.5" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <p className={`text-xs ${dark ? "text-red-400" : "text-red-600"}`}>
            Verification failed. If you&apos;re in a private/incognito window, try allowing
            third-party cookies, or use a regular window.
          </p>
        </div>
      )}
    </div>
  );
}
