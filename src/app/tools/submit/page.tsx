import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { listCategoriesWithCounts } from "@/lib/directory";
import ToolSubmitForm, { type SubmitCheckout } from "@/components/ToolSubmitForm";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME, OG_LOCALE } from "@/config/brand";
import { getCheckoutRegion, accountPhone } from "@/lib/checkoutRegion";
import { getRazorpayKeyId } from "@/lib/razorpay";
import { getPaypalClientId } from "@/lib/paypal";
import { getDirectoryListingPrice, formatListingPrice } from "@/lib/directoryListingPrice";
import DirectoryListingInProgress, { type InProgressListing } from "@/components/DirectoryListingInProgress";

const TITLE = `Submit Your Tool to the ${SITE_NAME} Directory`;

// Async because the paid tier's price is a console setting now, and a
// stale number in the search snippet is the kind of thing nobody notices
// until a visitor points it out.
export async function generateMetadata(): Promise<Metadata> {
  const price = formatListingPrice((await getDirectoryListingPrice()).usd, "USD");
  const description = `List your AI tool, SaaS, API, or open source project in the ${SITE_NAME} tools directory. Free with our badge on your site, or ${price} for a reviewed listing. Every submission is checked by hand.`;
  return {
    title: TITLE,
    description,
    alternates: { canonical: "/tools/submit" },
    openGraph: {
      title: TITLE,
      description,
      url: "/tools/submit",
      siteName: SITE_NAME,
      locale: OG_LOCALE,
    },
  };
}

const faq = (price: string) => [
  {
    q: "How much does a listing cost?",
    a: `Nothing, if you keep our badge on your site. We check for the link, not the image, so you can host the badge yourself. If you would rather not link back, a listing is ${price} once, with no renewal and no subscription.`,
  },
  {
    q: "Is the link dofollow?",
    a: "No. Every outbound link on every listing is nofollow, on the free tier and the paid tier alike. You are getting the listing page and the visitors who click it. A directory selling dofollow links is selling what Google itself calls a link scheme, and it eventually costs the buyer more than it ever paid.",
  },
  {
    q: "How long does the review take?",
    a: "Paid submissions are looked at before the free queue, usually within two working days. Free submissions take up to 14 days, because we also have to check the badge is on your site. Either way a human reads it, and you get an email with the outcome.",
  },
  {
    q: "What gets declined?",
    a: `Affiliate pages, resold white-label clones, listings for a product you have nothing to do with, and anything with no working product behind it yet. If we decline a paid submission we refund the ${price} in full.`,
  },
  {
    q: "Can I edit the listing later?",
    a: "Yes. Open My tools in your account and send us the change. The live listing stays as it is until we approve the edit, so a typo fix cannot take your page down.",
  },
  {
    q: "Do you write the description for me?",
    a: "We start it for you: paste your link and we read your own page for the name, tagline and description. You can rewrite all of it before submitting, and we may trim it for length during review.",
  },
];

export default async function SubmitToolPage() {
  const [session, categories, listingPrice] = await Promise.all([
    getSession(),
    listCategoriesWithCounts(),
    getDirectoryListingPrice(),
  ]);
  const priceLabel = formatListingPrice(listingPrice.usd, "USD");

  let checkout: SubmitCheckout | null = null;
  let inProgress: InProgressListing[] = [];
  if (session) {
    const [identity, phone, region, mine] = await Promise.all([
      pool.query<{ name: string | null }>("SELECT name FROM users WHERE id = $1", [session.userId]),
      accountPhone(session.userId),
      getCheckoutRegion(session.userId),
      // Anything of theirs that is not finished. Published and rejected are
      // left out: neither is something to pick up where they left off.
      pool.query<InProgressListing>(
        `SELECT t.id, t.name, t.status, t.listing_tier, t.paid_at, t.slug, c.slug AS category_slug
         FROM directory_tools t JOIN directory_categories c ON c.id = t.category_id
         WHERE t.submitted_by_user_id = $1
           AND t.status IN ('pending', 'approved_unpaid', 'changes_requested')
         ORDER BY t.created_at DESC`,
        [session.userId],
      ),
    ]);
    inProgress = mine.rows;
    const razorpayKeyId = getRazorpayKeyId();
    const paypalClientId = getPaypalClientId();
    const usable =
      region.method === "razorpay" && razorpayKeyId && listingPrice.prices.inr
        ? ("razorpay" as const)
        : region.method === "paypal" && paypalClientId
        ? ("paypal" as const)
        : null;
    checkout = {
      method: usable,
      amount: usable === "razorpay" ? listingPrice.prices.inr || 0 : listingPrice.usd,
      currency: usable === "razorpay" ? "INR" : "USD",
      razorpayKeyId: usable === "razorpay" ? razorpayKeyId : null,
      paypalClientId: usable === "paypal" ? paypalClientId : null,
      name: identity.rows[0]?.name || "",
      email: session.email,
      phone,
    };
  }

  const liveCategories = categories.filter((c) => c.tool_count > 0);
  const toolTotal = categories.reduce((sum, c) => sum + c.tool_count, 0);
  const FAQ = faq(priceLabel);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }} />

      <p className="text-sm text-ink-soft">
        <Link href="/tools" className="hover:text-ink">
          Tools Directory
        </Link>{" "}
        / Submit your tool
      </p>

      {/* Same drawn background as the directory hero rather than a second
          art file: one set of CSS, no image to download, and the two pages
          read as the same place. */}
      <section className="relative mt-4 overflow-hidden rounded-3xl bg-ink px-6 py-12 text-paper sm:px-10 sm:py-16">
        <div aria-hidden="true" className="absolute inset-0">
          <div className="directory-hero-grid absolute inset-0" />
          <div className="directory-hero-glow directory-hero-glow-a" />
          <div className="directory-hero-glow directory-hero-glow-b" />
        </div>
        <div className="relative max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-paper/60">
            Get listed
          </p>
          <h1 className="mt-4 text-balance font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Submit your tool
          </h1>
          <p className="mt-4 text-balance leading-7 text-paper/70">
            Built something indie marketers, coaches and small agencies should know about? Paste
            your link and we read your own page for the name, tagline and description. You only need
            an account at the end, to track the listing and edit it later.
          </p>
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
            {[
              { k: "Listed already", v: `${toolTotal} tools` },
              { k: "Categories", v: String(liveCategories.length || categories.length) },
              { k: "Free tier", v: "Badge on your site" },
              { k: "Paid tier", v: `${priceLabel} once` },
            ].map((stat) => (
              <div key={stat.k}>
                <dt className="text-xs uppercase tracking-wider text-paper/50">{stat.k}</dt>
                <dd className="mt-1 font-display text-lg font-semibold">{stat.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <DirectoryListingInProgress
            listings={inProgress}
            checkout={checkout}
            priceLabel={priceLabel}
          />
          <ToolSubmitForm
            loggedIn={!!session}
            categories={categories}
            checkout={checkout}
            priceLabel={priceLabel}
          />
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-line p-5 sm:p-6">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-soft">
              What a listing gets you
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6">
              {[
                "Your own page, indexed, with logo, screenshots and a real description",
                "Found through search, category and pricing filters by people already shopping",
                "A spot on your category page and in the sitemap",
                "Related-tool placements on other listings in your category",
                "Edit requests whenever your product changes",
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true" className="mt-0.5 shrink-0 font-medium">
                    &#10003;
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-line bg-paper-soft p-5 sm:p-6">
            <p className="text-sm font-medium">No pay-to-rank, either tier</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              Paying moves you up the review queue and nothing else. It does not move you up a
              results page, and every link stays nofollow. That is the whole reason anyone trusts
              the directory enough to click through it.
            </p>
          </div>

          {liveCategories.length > 0 && (
            <div className="rounded-3xl border border-line p-5 sm:p-6">
              <p className="text-sm font-medium">Where you would sit</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {liveCategories.slice(0, 12).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/tools/${c.slug}`}
                      className="inline-block rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-ink hover:text-ink"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/tools"
                className="mt-4 inline-block text-xs font-medium underline underline-offset-2 hover:text-ink"
              >
                Browse the whole directory
              </Link>
            </div>
          )}
        </aside>
      </div>

      <section className="mt-16 border-t border-line pt-10">
        <h2 className="font-display text-2xl font-semibold">Questions people ask first</h2>
        <dl className="mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="font-medium">{item.q}</dt>
              <dd className="mt-2 text-sm leading-6 text-ink-soft">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
