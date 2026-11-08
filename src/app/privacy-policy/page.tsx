import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { getBusiness } from "@/lib/businessProfile";
import LegalContactList from "@/components/LegalContactList";
import { FEATURES } from "@/config/features";
import { BuiltInPage, builtInPageMetadata } from "@/components/pageBlocks/SitePageView";

const SITE_DOMAIN = new URL(SITE_URL).hostname.replace(/^www\./, "");

const baseMetadata: Metadata = {
  title: "Privacy Policy",
  description:
    `How ${SITE_NAME} collects, uses, and protects your account, payment, and usage data, including cookies, data retention, and your rights under this policy.`,
  alternates: { canonical: "/privacy-policy" },
};


export async function generateMetadata(): Promise<Metadata> {
  return builtInPageMetadata("/privacy-policy", baseMetadata);
}

export default async function PrivacyPage() {
  const business = await getBusiness();
  const LEGAL = business.legal;
  return (
    <BuiltInPage path="/privacy-policy">
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="font-display text-4xl font-semibold">Privacy Policy</h1>
      <p className="mt-3 text-sm text-ink-soft">{LEGAL.lastUpdated ? `Last updated: ${LEGAL.lastUpdated}` : null}</p>

      <div className="mt-10 space-y-8 text-ink-soft [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_p]:mt-3 [&_li]:mt-2">
        <section>
          <p>
            {SITE_NAME} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;) is operated by {business.ownerName || business.brand}.{" "}
            {business.legalLine}{business.addressOneLine && ` Our registered address is ${business.addressOneLine}.`} This policy explains what information we collect through
            {" "}{SITE_DOMAIN} (the &ldquo;Site&rdquo;), why we collect it, and what rights you have over it.
          </p>
        </section>

        <section>
          <h2>1. Information we collect</h2>
          <p>
            <strong>Account information.</strong> When you sign up, we store your email address, a hashed
            password (we never store your password itself), and optionally your name.
          </p>
          <p>
            <strong>Profile & community information.</strong> If you use the community forum or blog comments,
            we store your username, avatar, bio, social links, posts, comments, and community activity you
            choose to share.
          </p>
          <p>
            <strong>Course & payment records.</strong> We store which courses you&apos;re enrolled in, your
            lesson progress, and a record that a payment was made (method, a reference ID, and status). We do
            not collect or store your card number, UPI ID, or other raw payment credentials &mdash; those are
            handled directly by our payment processors, Razorpay and PayPal.
          </p>
          <p>
            <strong>Messages you send us.</strong> If you use the contact form, apply to write for the blog, or
            email us, we store what you send so we can respond.
          </p>
          <p>
            <strong>Usage & device information.</strong> We use analytics and advertising measurement tools (Google Analytics and Meta Pixel) that collect standard usage data &mdash; pages visited, approximate location from IP,
            device/browser type, and on-page behavior like scrolling and clicks &mdash; to understand how the
            Site is used.
          </p>
        </section>

        <section>
          <h2>2. How we use your information</h2>
          <ul className="list-disc pl-5">
            <li>To create and maintain your account, and to grant access to courses you&apos;ve purchased</li>
            <li>To process payments and send purchase confirmations</li>
            <li>To respond to support requests, contact form messages, and author applications</li>
            <li>To operate the community forum, including moderation and enforcing our Terms</li>
            <li>To send you emails about your account, purchases, or (if you&apos;ve opted in) our newsletter</li>
            <li>To understand and improve how the Site performs, using aggregated analytics</li>
            <li>To detect and prevent spam, abuse, and fraudulent activity</li>
          </ul>
        </section>

        <section>
          <h2>3. Third-party services we use</h2>
          <p>We share the minimum data necessary with the following services to run the Site:</p>
          <ul className="list-disc pl-5">
            {(FEATURES.razorpay || FEATURES.paypal) && (
              <li>
                <strong>{[FEATURES.razorpay && "Razorpay", FEATURES.paypal && "PayPal"].filter(Boolean).join(" & ")}</strong>{" "}
                &mdash; payment processing for course purchases
              </li>
            )}
            {FEATURES.email && (
              <li><strong>Amazon Simple Email Service (AWS)</strong> &mdash; sending account, purchase, and newsletter emails</li>
            )}
            {FEATURES.whatsapp && (
              <li><strong>Meta (WhatsApp Business Platform)</strong> &mdash; sending and receiving WhatsApp messages, if you&apos;ve opted in</li>
            )}
            <li><strong>Cloudflare</strong> &mdash; content delivery, DNS, bot protection (Turnstile), and file storage for images/videos</li>
            <li><strong>OpenAI</strong> &mdash; used internally to help produce marketing images; not connected to your account data</li>
            <li><strong>Google Analytics & Meta Pixel</strong> &mdash; usage analytics and advertising measurement</li>
          </ul>
          <p>Each of these providers has its own privacy policy governing how they handle data on our behalf.</p>
        </section>

        <section>
          <h2>4. Cookies</h2>
          <p>
            We use a small number of cookies: a session cookie to keep you logged in, and analytics and advertising measurement cookies
            (Google Analytics and Meta Pixel) to understand Site usage and measure campaign performance.
          </p>
        </section>

        <section>
          <h2>5. Data retention</h2>
          <p>
            We keep account and course data for as long as your account is active. If you ask us to delete
            your account, we&apos;ll delete your personal information within a reasonable time, except where we
            need to retain records for legal, tax, or dispute-resolution purposes (for example, a record that a
            payment was made).
          </p>
        </section>

        <section>
          <h2>6. Your rights</h2>
          <p>
            You can download a copy of your account data, or delete your account, directly from{" "}
            <Link href="/account?tab=settings" className="text-ink underline">
              Account Settings
            </Link>{" "}
            &mdash; no need to email us. Deleting your account removes your personal information (name, email,
            avatar, bio, private messages, notifications) and course/community access; posts and comments you&apos;ve
            made stay up so other people&apos;s conversations aren&apos;t broken, but are shown as posted by a
            &ldquo;Deleted user&rdquo; with no link back to you. As noted in section 5, we keep records we&apos;re
            legally required to retain (like a record that a payment was made) even after deletion. You can also
            reach us any time at{" "}
            <a href={`mailto:${business.emails[0] || ""}`} className="text-ink underline">
              {business.emails[0] || "our contact email"}
            </a>{" "}
            to access, correct, or ask about your data. You can update your profile information (name, avatar,
            bio) directly from your account settings too.
          </p>
        </section>

        <section>
          <h2>7. Children&apos;s privacy</h2>
          <p>
            The Site is intended for users aged {LEGAL.minAge} and older. If you are under 18, you should have a parent or
            guardian&apos;s permission before creating an account or making a purchase. We do not knowingly
            collect information from children under {LEGAL.minAge}.
          </p>
        </section>

        <section>
          <h2>8. Data security</h2>
          <p>
            We use industry-standard measures to protect your data, including encrypted connections (HTTPS),
            hashed passwords, and access controls on our database and admin systems. No method of transmission
            or storage is 100% secure, but we work to protect your information appropriately.
          </p>
        </section>

        <section>
          <h2>9. International users</h2>
          <p>
            We&apos;re based in {business.legal.governingLawCountry} and our servers and data are primarily processed there.
            {FEATURES.paypal && (
              <> If you&apos;re paying via PayPal from outside {business.legal.governingLawCountry}, your payment is processed by PayPal under its own terms and
              may involve cross-border data transfer.</>
            )}
          </p>
        </section>

        <section>
          <h2>10. Changes to this policy</h2>
          <p>
            We may update this policy as the Site changes. We&apos;ll update the &ldquo;Last updated&rdquo; date
            above when we do. Continued use of the Site after a change means you accept the updated policy.
          </p>
        </section>

        <section>
          <h2>11. Contact us</h2>
          <p>Questions about this policy or your data? Contact us:</p>
          <LegalContactList business={business} />
        </section>
      </div>
    </div>
    </BuiltInPage>
  );
}
