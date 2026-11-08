"use client";

import { useEffect, useState } from "react";
import SafeImage from "@/components/SafeImage";
import Link from "next/link";
import { pickSignupOffer, type SignupOffer } from "@/lib/signupOffers";

/** Sits directly in the page content (below a prompt's copy button, or
 * between guide steps) -- NOT fixed/floating. Owner explicitly rejected a
 * fixed bottom banner: it went unnoticed and broke on mobile. This is
 * real internal linking embedded where someone is already reading, with
 * its own rotating offer so it's not always advertising the same thing. */
export default function InlineSignupCta() {
  const [offer, setOffer] = useState<SignupOffer | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOffer(pickSignupOffer());
  }, []);

  if (!offer) return null;

  return (
    <div className="mt-6 flex flex-col overflow-hidden rounded-2xl border border-line sm:flex-row">
      <div className="relative h-36 w-full shrink-0 sm:h-auto sm:w-48">
        <SafeImage src={offer.image} alt="" fill sizes="(min-width: 640px) 192px, 100vw" className="object-cover" />
      </div>
      <div className="flex flex-1 flex-col justify-center p-5">
        <p className="font-display text-base font-semibold">{offer.headline}</p>
        <p className="mt-1 text-sm text-ink-soft">{offer.subheadline}</p>
        <Link
          href={offer.href}
          className="mt-3 inline-flex w-fit items-center gap-1 text-sm font-medium text-ink underline underline-offset-2 hover:no-underline"
        >
          {offer.linkLabel} &rarr;
        </Link>
      </div>
    </div>
  );
}
