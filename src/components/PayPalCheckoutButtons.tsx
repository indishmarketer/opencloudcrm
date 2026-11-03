"use client";

import { useEffect, useRef, useState } from "react";
import { trackMetaEvent } from "@/lib/metaPixel";

type PaypalButtons = { isEligible: () => boolean; render: (el: HTMLElement) => Promise<void>; close?: () => void };
type PaypalSdk = {
  Buttons: (options: Record<string, unknown>) => PaypalButtons;
  FUNDING: { CARD: string; PAYPAL: string };
};

declare global {
  interface Window {
    paypal?: PaypalSdk;
  }
}

let sdk: { clientId: string; promise: Promise<PaypalSdk> } | null = null;

/** Loads PayPal's JS SDK once per page and keeps it. The course page calls
 * this as soon as an international buyer lands, so the buttons are ready
 * by the time they click Buy instead of downloading the SDK only then. */
export function loadPaypalSdk(clientId: string): Promise<PaypalSdk> {
  if (sdk?.clientId === clientId) return sdk.promise;
  const promise = new Promise<PaypalSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&components=buttons&intent=capture`;
    script.async = true;
    script.dataset.namespace = "paypal";
    script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal did not load.")));
    script.onerror = () => {
      sdk = null;
      script.remove();
      reject(new Error("Could not load PayPal."));
    };
    document.head.appendChild(script);
  });
  sdk = { clientId, promise };
  return promise;
}

/** PayPal's JS SDK, rendered as two standalone black pill buttons ("Debit
 * or Credit Card", "Pay with PayPal") so they sit next to our own buttons
 * without PayPal's yellow button or "Powered by PayPal" line. The card
 * button opens PayPal's card form inline on this page, no PayPal account
 * or login needed. A fully custom-drawn card button would have to send the
 * buyer to paypal.com, which asks Indian-merchant buyers to log in. */
export default function PayPalCheckoutButtons({
  clientId,
  courseId,
  courseSlug,
  priceUsd,
  priceQuote,
  email,
  phone,
}: {
  clientId: string;
  courseId: number;
  courseSlug: string;
  priceUsd: number;
  priceQuote: string | null;
  email?: string;
  phone?: string | null;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const paypalRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const capturing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const rendered: PaypalButtons[] = [];
    loadPaypalSdk(clientId)
      .then(async (pp) => {
        if (cancelled) return;
        const options = {
          createOrder: async () => {
            setError("");
            trackMetaEvent("AddPaymentInfo", {
              content_ids: [courseSlug],
              content_name: courseSlug,
              content_type: "product",
              currency: "USD",
              value: priceUsd,
            });
            const res = await fetch("/api/payments/paypal/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                courseId,
                ...(priceQuote ? { quote: priceQuote } : {}),
                ...(email ? { email } : {}),
                ...(phone ? { phone } : {}),
              }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError(body.error || "Could not start checkout.");
              throw new Error(body.error || "Could not start checkout.");
            }
            return body.orderId;
          },
          onApprove: async (data: { orderID: string }) => {
            if (capturing.current) return;
            capturing.current = true;
            setConfirming(true);
            try {
              const res = await fetch("/api/payments/paypal/capture-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: data.orderID }),
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) {
                setError(body.error || "Payment captured but we couldn't confirm it. Contact support.");
                return;
              }
              const slug = encodeURIComponent(body.courseSlug || courseSlug);
              window.location.assign(new URL(`/account/courses/${slug}/unlocked`, window.location.origin).toString());
            } finally {
              capturing.current = false;
              setConfirming(false);
            }
          },
          onError: () => setError((current) => current || "Something went wrong with the payment. Please try again."),
        };
        const targets: [string, HTMLDivElement | null, Record<string, unknown>][] = [
          [pp.FUNDING.CARD, cardRef.current, { shape: "pill", color: "black", height: 45 }],
          [pp.FUNDING.PAYPAL, paypalRef.current, { shape: "pill", color: "black", height: 45, label: "pay" }],
        ];
        const renders: Promise<void>[] = [];
        for (const [fundingSource, el, style] of targets) {
          if (!el) continue;
          const buttons = pp.Buttons({ ...options, fundingSource, style });
          if (buttons.isEligible()) {
            rendered.push(buttons);
            renders.push(buttons.render(el));
          }
        }
        if (rendered.length === 0) {
          setError("Card and PayPal payments aren't available for your location or browser. Contact support and we'll help you pay another way.");
          return;
        }
        await Promise.allSettled(renders);
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the card form. Please refresh and try again.");
      });
    return () => {
      cancelled = true;
      rendered.forEach((b) => b.close?.());
    };
  }, [clientId, courseId, courseSlug, priceUsd, priceQuote, email, phone]);

  return (
    <div>
      {!ready && !error && (
        <div aria-hidden="true" className="space-y-2">
          <div className="h-[45px] w-full animate-pulse rounded-full bg-ink/10" />
          <div className="h-[45px] w-full animate-pulse rounded-full bg-ink/10" />
        </div>
      )}
      {!ready && !error && <p className="sr-only">Loading card and PayPal payment options…</p>}
      <div className={ready ? "" : "h-0 overflow-hidden"}>
        <div ref={cardRef} className="w-full" />
        <div ref={paypalRef} className="mt-2 w-full" />
      </div>
      {confirming && <p className="mt-2 text-xs text-ink-soft">Confirming payment…</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
