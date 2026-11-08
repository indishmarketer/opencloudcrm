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
  const business = await getBusiness();
  return {
    title: "Terms and Conditions",
    description:
      `The Terms and Conditions covering accounts, course purchases, refunds, community guidelines, and acceptable use for ${SITE_DOMAIN}, operated by ${business.ownerName || business.brand}.`,
    alternates: { canonical: "/terms" },
  };
}


export async function generateMetadata(): Promise<Metadata> {
  return builtInPageMetadata("/terms", await baseMetadata());
}

export default async function TermsPage() {
  const business = await getBusiness();
  const LEGAL = business.legal;
  return (
    <BuiltInPage path="/terms">
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="font-display text-4xl font-semibold">Terms and Conditions</h1>
      <p className="mt-3 text-sm text-ink-soft">{LEGAL.lastUpdated ? `Last updated: ${LEGAL.lastUpdated}` : null}</p>

      <div className="mt-10 space-y-8 text-ink-soft [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_p]:mt-3 [&_li]:mt-2">
        <section>
          <p>
            These Terms and Conditions (&ldquo;Terms&rdquo;) govern your use of {SITE_DOMAIN} (the
            &ldquo;Site&rdquo;) and the courses, products and services offered on it by {SITE_NAME}
            (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;). {business.legalLine}
            {business.addressOneLine && ` Our registered address is ${business.addressOneLine}.`} By creating an account, purchasing a course or product, or
            otherwise using the Site, you agree to these Terms.
          </p>
        </section>

        <section>
          <h2>1. Eligibility</h2>
          <p>
            You must be at least {LEGAL.minAge} years old to use the Site. If you are under 18, you should have a parent or
            guardian&apos;s permission before creating an account or making a purchase.
          </p>
        </section>

        <section>
          <h2>2. Accounts</h2>
          <p>
            You&apos;re responsible for keeping your login credentials secure and for all activity under your
            account. Let us know immediately if you suspect unauthorized access. We reserve the right to
            suspend or terminate accounts that violate these Terms.
          </p>
        </section>

        <section>
          <h2>3. Courses & payments</h2>
          <p>
            Courses are sold as one-time payments for lifetime access to the tier purchased (free or PRO).
            Prices are shown at checkout{" "}
            {[FEATURES.razorpay && "in INR (via Razorpay)", FEATURES.paypal && "in USD (via PayPal)"]
              .filter(Boolean)
              .join(" or ") || "in your local currency"}{" "}
            and may change over time without affecting access you&apos;ve already purchased.
          </p>
          <p>
            Course content is for your personal, non-commercial use. You may not resell, redistribute, or share
            course materials, video content, or your account access with anyone else.
          </p>
        </section>

        <section>
          <h2>4. Refund policy</h2>
          <p>
            See our{" "}
            <Link href="/refund-policy" className="text-ink underline">
              Cancellation &amp; Refund Policy
            </Link>{" "}
            for the full details on cancelling an order or requesting a refund.
          </p>
        </section>

        <section>
          <h2>5. Community guidelines</h2>
          <p>
            If you post in the community forum or comment on the blog, you agree to keep it respectful and
            on-topic: no harassment, spam, hate speech, or illegal content. We reserve the right to remove
            content, restrict, or ban accounts that violate these guidelines, at our discretion.
          </p>
          <p>
            You retain ownership of what you post, but you grant us a license to display it on the Site as part
            of normal operation (for example, showing your post in the forum feed).
          </p>
        </section>

        <section>
          <h2>6. Intellectual property</h2>
          <p>
            All course content, site design, and original written content on the Site is owned by {SITE_NAME}
            unless otherwise noted, and is protected by copyright. You may not copy, reproduce, or
            create derivative works from it without our permission.
          </p>
        </section>

        <section>
          <h2>7. Prohibited conduct</h2>
          <ul className="list-disc pl-5">
            <li>Attempting to access another user&apos;s account or data</li>
            <li>Scraping, reverse-engineering, or bulk-downloading Site content</li>
            <li>Using the Site to distribute malware, spam, or illegal content</li>
            <li>Circumventing payment or access controls to obtain course content without paying</li>
          </ul>
        </section>

        <section>
          <h2>8. Third-party services</h2>
          <p>
            The Site relies on third-party services, including{" "}
            {[
              FEATURES.razorpay && "Razorpay",
              FEATURES.paypal && "PayPal",
              FEATURES.whatsapp && "Meta (WhatsApp)",
              "Amazon Web Services",
              "Cloudflare",
            ].filter(Boolean).join(", ")}, to
            operate. Your use of those services (for example, making a payment) is also subject to their own
            terms.
          </p>
        </section>

        <section id="affiliate-disclosure">
          <h2>Affiliate disclosure</h2>
          <p>Some pages contain affiliate links. If you purchase through one of these links, we may earn a commission at no additional cost to you. Compensation does not guarantee a favorable review or recommendation, and readers should independently evaluate products before purchasing.</p>
        </section>

        <section>
          <h2>9. Disclaimer of warranties</h2>
          <p>
            The Site and its content are provided &ldquo;as is,&rdquo; without warranties of any kind. We don&apos;t
            guarantee that courses will produce specific results for your business &mdash; outcomes depend on
            your own effort and circumstances.
          </p>
        </section>

        <section>
          <h2>10. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, {SITE_NAME} and {business.ownerName || business.brand} are not liable for any
            indirect, incidental, or consequential damages arising from your use of the Site. Our total
            liability for any claim is limited to the amount you paid us in the 12 months before the claim
            arose.
          </p>
        </section>

        <section>
          <h2>11. Governing law</h2>
          <p>
            These Terms are governed by the laws of {LEGAL.governingLawCountry}. Any disputes will be subject to the exclusive
            jurisdiction of the courts in {LEGAL.governingLawJurisdiction}.
          </p>
        </section>

        <section>
          <h2>12. Changes to these terms</h2>
          <p>
            We may update these Terms as the Site changes. We&apos;ll update the &ldquo;Last updated&rdquo; date
            above when we do. Continued use of the Site after a change means you accept the updated Terms.
          </p>
        </section>

        <section>
          <h2>13. Contact us</h2>
          <p>Questions about these Terms? Contact us:</p>
          <LegalContactList business={business} />
        </section>
      </div>
    </div>
    </BuiltInPage>
  );
}
