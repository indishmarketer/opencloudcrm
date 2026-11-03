"use client";

import { useEffect, useState } from "react";
import { preconnect } from "react-dom";
import Link from "next/link";
import ConsoleModal from "@/components/ConsoleModal";
import RazorpayCheckoutButton from "@/components/RazorpayCheckoutButton";
import PayPalCheckoutButtons from "@/components/PayPalCheckoutButtons";
import AccountCountryForm from "@/components/AccountCountryForm";
import { trackMetaEvent } from "@/lib/metaPixel";
import { countryName } from "@/lib/countries";
import type { CheckoutOffer } from "@/lib/checkoutRegion";

export default function UnlockProModal({
  courseId,
  courseSlug,
  offer,
  priceQuote,
  userId,
  userName,
  userEmail,
  userPhone,
  buttonLabel = "Unlock PRO",
  modalTitle = "Unlock PRO access",
}: {
  courseId: number;
  courseSlug: string;
  offer: CheckoutOffer;
  priceQuote: string | null;
  userId: number;
  userName: string;
  userEmail: string;
  userPhone?: string | null;
  buttonLabel?: string;
  modalTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [changingCountry, setChangingCountry] = useState(false);
  const { method, amount, currency, paypalClientId, country } = offer;

  // PayPal's buttons are iframes served from paypal.com and take a second
  // or two to appear. Build the (hidden) popup with them once the page is
  // idle, so clicking Buy just reveals buttons that are already there.
  // Razorpay's button is our own, so it mounts on click as before.
  if (method === "paypal") {
    preconnect("https://www.paypal.com");
    preconnect("https://www.paypalobjects.com");
  }
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    if (method !== "paypal" || !paypalClientId) return;
    const start = () => setWarm(true);
    const idle = window.requestIdleCallback;
    if (idle) {
      const handle = idle(start, { timeout: 1500 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(start, 300);
    return () => window.clearTimeout(timer);
  }, [method, paypalClientId]);

  const priceLabel =
    amount == null ? "" : currency === "USD" ? `$${amount.toLocaleString("en-US")}` : `₹${amount.toLocaleString("en-IN")}`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setChangingCountry(false);
          trackMetaEvent("InitiateCheckout", {
            content_ids: [courseSlug],
            content_name: courseSlug,
            content_type: "product",
            ...(amount != null ? { currency, value: amount } : {}),
            order_id: `${courseSlug}-${userId}`,
          });
        }}
        className="shrink-0 whitespace-nowrap rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
      >
        {buttonLabel}
      </button>

      {(open || warm) && (
        <ConsoleModal title={modalTitle} onClose={() => setOpen(false)} open={open}>
          <p className="text-sm text-ink-soft">Unlock every module, instantly.</p>

          <div className="mt-5">
            {method === "razorpay" && amount != null && amount > 0 && (
              <div className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Pay in INR</p>
                  <p className="text-sm text-ink-soft">{priceLabel}</p>
                </div>
                <p className="mt-1 text-xs text-ink-soft">UPI, cards, netbanking, or wallets.</p>
                <div className="mt-3 min-h-[44px]">
                  <RazorpayCheckoutButton
                    courseId={courseId}
                    courseSlug={courseSlug}
                    priceInr={amount}
                    priceQuote={priceQuote}
                    name={userName}
                    email={userEmail}
                    phone={userPhone}
                  />
                </div>
              </div>
            )}

            {method === "paypal" && paypalClientId && amount != null && amount > 0 && (
              <div className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Pay in USD</p>
                  <p className="text-sm text-ink-soft">{priceLabel}</p>
                </div>
                <p className="mt-1 text-xs text-ink-soft">Debit card, credit card, or PayPal.</p>
                <div className="mt-3">
                  <PayPalCheckoutButtons
                    clientId={paypalClientId}
                    courseId={courseId}
                    courseSlug={courseSlug}
                    priceUsd={amount}
                    priceQuote={priceQuote}
                    email={userEmail}
                    phone={userPhone}
                  />
                </div>
              </div>
            )}

            {(method === null || amount == null || amount <= 0) && (
              <p className="rounded-xl border border-line p-4 text-sm text-ink-soft">
                Online payment isn&apos;t available right now.{" "}
                <Link href="/contact" className="underline hover:text-ink">
                  Contact us
                </Link>{" "}
                and we&apos;ll help you get access.
              </p>
            )}
          </div>

          <div className="mt-4 text-xs text-ink-soft">
            {changingCountry ? (
              <div>
                <p className="mb-2">Where are you paying from?</p>
                <AccountCountryForm
                  initialCountry={country}
                  saveLabel="Update"
                  onSaved={() => setChangingCountry(false)}
                />
              </div>
            ) : (
              <p>
                {country ? `Paying from ${countryName(country)}.` : "Paying from India."}{" "}
                <button type="button" onClick={() => setChangingCountry(true)} className="underline hover:text-ink">
                  Not right? Change
                </button>
              </p>
            )}
          </div>

          <p className="mt-3 text-xs text-ink-soft">
            By purchasing, you agree to our{" "}
            <Link href="/terms" className="underline hover:text-ink">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy-policy" className="underline hover:text-ink">
              Privacy Policy
            </Link>
            . Refunds are available within 7 days. See our Terms for details.
          </p>
        </ConsoleModal>
      )}
    </>
  );
}
