"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadPaypalSdk } from "@/components/PayPalCheckoutButtons";
import { SITE_NAME } from "@/config/brand";

type Props = {
  toolId: number;
  toolName: string;
  method: "razorpay" | "paypal";
  amount: number;
  currency: "INR" | "USD";
  quote: string | null;
  razorpayKeyId: string | null;
  paypalClientId: string | null;
  name: string;
  email: string;
  phone: string | null;
};

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, callback: (response: { error?: { description?: string } }) => void) => void;
    };
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SCRIPT}"]`);
    const script = existing || document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load Razorpay.")), { once: true });
    if (!existing) {
      script.src = RAZORPAY_SCRIPT;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

export default function DirectoryListingCheckout(props: Props) {
  const router = useRouter();
  const paypalMount = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (props.method !== "paypal" || !props.paypalClientId || !paypalMount.current) return;
    let cancelled = false;
    let button: { render: (target: HTMLElement) => Promise<void>; close?: () => void } | null = null;
    loadPaypalSdk(props.paypalClientId)
      .then((paypal) => {
        if (cancelled || !paypalMount.current) return;
        button = paypal.Buttons({
          fundingSource: paypal.FUNDING.CARD,
          style: { shape: "pill", color: "black", height: 45 },
          createOrder: async () => {
            setError("");
            const response = await fetch("/api/payments/directory/paypal/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ toolId: props.toolId }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || "Could not start checkout.");
            return body.orderId;
          },
          onApprove: async (data: { orderID: string }) => {
            setBusy(true);
            setError("");
            try {
              const response = await fetch("/api/payments/directory/paypal/capture-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: data.orderID }),
              });
              const body = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(body.error || "Could not confirm payment.");
              router.push("/account/tools?paid=1");
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Could not confirm payment.");
            } finally {
              setBusy(false);
            }
          },
          onError: () => setError((current) => current || "Something went wrong with checkout. Please try again."),
        });
        void button.render(paypalMount.current);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load PayPal.");
      });
    return () => {
      cancelled = true;
      button?.close?.();
    };
  }, [props.method, props.paypalClientId, props.toolId, router]);

  async function startRazorpay() {
    if (!props.razorpayKeyId) return;
    setBusy(true);
    setError("");
    try {
      const [, response] = await Promise.all([
        loadRazorpay(),
        fetch("/api/payments/directory/razorpay/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolId: props.toolId, ...(props.quote ? { quote: props.quote } : {}) }),
        }),
      ]);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not start checkout.");
      if (!window.Razorpay) throw new Error("Could not load Razorpay.");
      const checkout = new window.Razorpay({
        key: body.keyId,
        order_id: body.orderId,
        amount: body.amount,
        currency: body.currency,
        name: SITE_NAME,
        description: `Directory listing: ${props.toolName}`,
        prefill: { name: props.name, email: props.email, ...(props.phone ? { contact: props.phone } : {}) },
        theme: { color: "#0a0a0a" },
        handler: async (payment: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          setBusy(true);
          const verified = await fetch("/api/payments/directory/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: payment.razorpay_order_id,
              paymentId: payment.razorpay_payment_id,
              signature: payment.razorpay_signature,
            }),
          }).catch(() => null);
          const result = verified ? await verified.json().catch(() => ({})) : {};
          if (!verified?.ok) {
            setError(result.error || "We could not confirm the payment. Contact support if you were charged.");
            setBusy(false);
            return;
          }
          router.push("/account/tools?paid=1");
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      checkout.on("payment.failed", (response) => {
        setError(response.error?.description || "Payment failed. Please try again.");
        setBusy(false);
      });
      checkout.open();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start checkout.");
      setBusy(false);
    }
  }

  const label = props.currency === "INR"
    ? `Pay ₹${props.amount.toLocaleString("en-IN")}`
    : `Pay $${props.amount.toFixed(2)}`;

  return (
    <div className="mt-4">
      {props.method === "razorpay" ? (
        <button
          type="button"
          onClick={startRazorpay}
          disabled={busy || !props.razorpayKeyId}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
        >
          {busy ? "Opening checkout..." : label}
        </button>
      ) : (
        <>
          <div ref={paypalMount} className="max-w-xs" />
          {busy && <p className="mt-2 text-xs text-ink-soft">Confirming payment...</p>}
        </>
      )}
      <p className="mt-2 text-xs text-ink-soft">One-time listing fee. The listing goes live after payment is confirmed.</p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
