import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { getBusiness } from "@/lib/businessProfile";
import LegalContactList from "@/components/LegalContactList";
import { FEATURES } from "@/config/features";
import { BuiltInPage, builtInPageMetadata } from "@/components/pageBlocks/SitePageView";

const SITE_DOMAIN = new URL(SITE_URL).hostname.replace(/^www\./, "");

async function baseMetadata(): Promise<Metadata> {
  const { legal } = await getBusiness();
  return {
    title: "Cancellation & Refund Policy",
    description:
      `How cancellations and refunds work for courses and digital products bought on ${SITE_NAME}: a ${legal.refundWindowDays}-day refund window, processed within ${legal.refundProcessingDays} business days.`,
    alternates: { canonical: "/refund-policy" },
  };
}


export async function generateMetadata(): Promise<Metadata> {
  return builtInPageMetadata("/refund-policy", await baseMetadata());
}

export default async function RefundPolicyPage() {
  const business = await getBusiness();
  const LEGAL = business.legal;
  const refundMethods = [
    FEATURES.razorpay && "the same card, UPI or bank account through Razorpay",
    FEATURES.paypal && "the same PayPal account",
  ].filter(Boolean);

  return (
    <BuiltInPage path="/refund-policy">
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="font-display text-4xl font-semibold">Cancellation &amp; Refund Policy</h1>
      <p className="mt-3 text-sm text-ink-soft">{LEGAL.lastUpdated ? `Last updated: ${LEGAL.lastUpdated}` : null}</p>

      <div className="mt-10 space-y-8 text-ink-soft [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_p]:mt-3 [&_li]:mt-2">
        <section>
          <p>
            This policy explains how cancellations and refunds work for courses and digital products bought on
            {" "}{SITE_DOMAIN}. {business.legalLine} It applies alongside our{" "}
            <Link href="/terms" className="text-ink underline">
              Terms and Conditions
            </Link>
            .{" "}
            {[
              FEATURES.razorpay && "All prices are charged in Indian Rupees (₹) through Razorpay",
              FEATURES.paypal && "in US dollars through PayPal for customers outside " + LEGAL.governingLawCountry,
            ].filter(Boolean).join(", or ") || "Prices are charged through our configured payment provider"}.
          </p>
        </section>

        <section>
          <h2>1. Refunds for courses and digital products</h2>
          <p>
            Due to the digital nature of our courses and products, you get access the moment your payment
            succeeds. You can still request a full refund within <strong className="text-ink">{LEGAL.refundWindowDays} days of purchase</strong>,
            no questions asked. Approved refunds are processed within{" "}
            <strong className="text-ink">{LEGAL.refundProcessingDays} business days</strong>. After {LEGAL.refundWindowDays} days, purchases are final and
            non-refundable.
          </p>
        </section>

        <section>
          <h2>2. Cancellations</h2>
          <p>
            Courses and digital products are delivered instantly, so an order can&apos;t be cancelled before
            delivery. To cancel a purchase, request a refund within the {LEGAL.refundWindowDays}-day window above.
          </p>
          <p>
            Free discovery calls can be cancelled or rescheduled at any time using the link in your booking
            confirmation email. For custom automation and AI-agent projects, cancellation and refund terms are
            set out in the written proposal or agreement for that project.
          </p>
        </section>

        <section>
          <h2>3. How to request a refund or cancellation</h2>
          <p>
            Email us with the email address you purchased with and the course or product name. We&apos;ll confirm
            by email once the refund is processed.
          </p>
          <LegalContactList business={business} />
        </section>

        <section>
          <h2>4. How refunds are issued</h2>
          <p>
            Refunds go back to the original payment method{refundMethods.length > 0 ? `: ${refundMethods.join(", or ")}` : ""}.
            Once we issue a refund, your bank or payment provider may take a few
            additional days to show it on your statement.
          </p>
        </section>

        <section>
          <h2>5. Access after a refund</h2>
          <p>
            Once a refund is issued, paid (PRO) access to that course or product is removed. If the course has
            free modules, you keep access to those.
          </p>
        </section>

        <section>
          <h2>6. Failed or duplicate payments</h2>
          <p>
            If money left your account but you didn&apos;t get access, or you were charged twice for the same
            purchase, contact us with your payment reference. We&apos;ll either give you access or refund the
            extra payment in full, within the same {LEGAL.refundProcessingDays} business days.
          </p>
        </section>

        <section>
          <h2>7. Contact</h2>
          <p>
            {business.brand}
            {business.ownerName && `, owned by ${business.ownerName}`}
            {business.addressOneLine && `. Registered address: ${business.addressOneLine}`}.
          </p>
        </section>
      </div>
    </div>
    </BuiltInPage>
  );
}
