"use client";

import { useState } from "react";
import { trackMetaEvent } from "@/lib/metaPixel";
import { SITE_NAME } from "@/config/brand";

type RazorpaySuccess = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, cb: (resp: { error?: { description?: string } }) => void) => void };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing || document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Could not load Razorpay.")));
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

/** Razorpay Standard Checkout: our server creates the order, checkout.js
 * collects the payment (UPI, cards, netbanking, wallets), then our server
 * verifies the signature and grants access before we navigate. */
export default function RazorpayCheckoutButton({
  courseId,
  courseSlug,
  priceInr,
  priceQuote,
  name,
  email,
  phone,
}: {
  courseId: number;
  courseSlug: string;
  priceInr: number;
  priceQuote: string | null;
  name: string;
  email: string;
  phone?: string | null;
}) {
  const [status, setStatus] = useState<"idle" | "opening" | "verifying">("idle");
  const [error, setError] = useState("");

  async function verify(resp: RazorpaySuccess) {
    setStatus("verifying");
    const res = await fetch("/api/payments/razorpay/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: resp.razorpay_order_id,
        paymentId: resp.razorpay_payment_id,
        signature: resp.razorpay_signature,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = res ? await res.json().catch(() => ({})) : {};
      // The webhook may still grant access, so send them to the status page
      // only on success and otherwise say exactly what to do.
      setError(body.error || "Payment received but we couldn't confirm it yet. Contact support if access doesn't appear shortly.");
      setStatus("idle");
      return;
    }
    window.location.assign(new URL(`/account/courses/${encodeURIComponent(courseSlug)}/unlocked`, window.location.origin).toString());
  }

  async function start() {
    setError("");
    setStatus("opening");
    trackMetaEvent("AddPaymentInfo", {
      content_ids: [courseSlug],
      content_name: courseSlug,
      content_type: "product",
      currency: "INR",
      value: priceInr,
    });
    try {
      const [, res] = await Promise.all([
        loadCheckout(),
        fetch("/api/payments/razorpay/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId, ...(priceQuote ? { quote: priceQuote } : {}) }),
        }),
      ]);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not start checkout.");
      if (!window.Razorpay) throw new Error("Could not load Razorpay.");

      const checkout = new window.Razorpay({
        key: body.keyId,
        order_id: body.orderId,
        amount: body.amount,
        currency: body.currency,
        name: SITE_NAME,
        description: body.courseTitle,
        prefill: { name, email, ...(phone ? { contact: phone } : {}) },
        theme: { color: "#0a0a0a" },
        handler: (resp: RazorpaySuccess) => void verify(resp),
        modal: { ondismiss: () => setStatus("idle") },
      });
      checkout.on("payment.failed", (resp) => {
        setError(resp.error?.description || "Payment failed. Try again or use another method.");
      });
      checkout.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout.");
      setStatus("idle");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={status !== "idle"}
        className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {status === "verifying"
          ? "Confirming payment…"
          : status === "opening"
            ? "Opening checkout…"
            : `Pay ₹${priceInr.toLocaleString("en-IN")}`}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
