import type { Metadata } from "next";
import ContactClient from "./ContactClient";

export const metadata: Metadata = {
  title: "Contact | Indish Marketer",
  description: "Tell me what you're trying to build, or what you're paying for that you'd rather own. Questions about a course or a payment are fine here too. It comes straight to me.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <div className="max-w-3xl">
        <h1 className="font-display text-4xl font-semibold sm:text-5xl text-ink tracking-tight">
          Get in touch
        </h1>
        <p className="mt-4 text-base sm:text-lg text-ink-soft leading-relaxed">
          Tell me what you&apos;re trying to build, or what you&apos;re paying for that you&apos;d rather own. Questions about a course or a payment are fine here too. It comes straight to me, not a support queue, and I answer them myself.
        </p>
      </div>

      <div className="mt-10">
        <ContactClient />
      </div>
    </main>
  );
}
