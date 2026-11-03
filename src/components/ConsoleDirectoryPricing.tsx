"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ConsolePaymentsSettings from "@/components/ConsolePaymentsSettings";

/**
 * The paid-listing price, inside the tools directory.
 *
 * It already lives on /console/payments, which is the right home for money
 * across the whole site. The owner went looking for it here, in the
 * directory, which is also right: it is a directory price. Rather than
 * pick a winner, both show the same control over the same `site_settings`
 * row, and each points at the other.
 *
 * Client-side fetch rather than a server prop because the directory
 * console is one client component with tabs; making the page fetch it
 * would load it for everyone who opens the Tools tab and never looks here.
 */
export default function ConsoleDirectoryPricing() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; usd: number; inr: number | null }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/console/site-settings");
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not load the price.");
        if (cancelled) return;
        const raw = Number(body.settings?.directory_listing_price_usd);
        setState({
          status: "ready",
          usd: Number.isFinite(raw) ? raw : 5,
          inr: body.meta?.listing_price_inr ?? null,
        });
      } catch (cause) {
        if (!cancelled) {
          setState({ status: "error", message: cause instanceof Error ? cause.message : "Could not load the price." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <p className="text-sm text-ink-soft">Loading the price…</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-red-600">{state.message}</p>;
  }

  return (
    <div className="max-w-2xl space-y-4">
      <ConsolePaymentsSettings
        initialPriceUsd={state.usd}
        inrPreview={state.inr}
        min={1}
        max={500}
      />
      <div className="rounded-2xl border border-line p-5 text-sm text-ink-soft">
        <p>
          This is the same setting as the one on{" "}
          <Link href="/console/payments" className="underline underline-offset-2 hover:text-ink">
            Payments
          </Link>
          , which also shows what has been collected, which gateways are live, and the paid
          listings that never finished checkout.
        </p>
        <p className="mt-3">
          The free tier has no price to set. It is conditional on our badge being on their site,
          which the Tools tab checks per listing.
        </p>
      </div>
    </div>
  );
}
