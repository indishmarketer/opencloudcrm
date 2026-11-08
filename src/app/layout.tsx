import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import PublicSiteOnly from "@/components/PublicSiteOnly";
import Analytics from "@/components/Analytics";
import EarlyBirdBanner from "@/components/EarlyBirdBanner";
import { serializeJsonLd } from "@/lib/jsonLd";
import { OG_LOCALE, OG_ASSET_VERSION, assetUrl } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { getBusiness, type ResolvedBusiness } from "@/lib/businessProfile";
import { getSiteChrome } from "@/lib/siteChrome";
import { getSiteIdentity, resolveSiteName } from "@/lib/siteIdentity";
import { getPublishedPage } from "@/lib/sitePages";
import { getSiteTheme } from "@/lib/siteTheme";
import { siteThemeCss } from "@/lib/siteThemeShape";

// Inter is used for both --font-display and --font-body -- owner wants one
// font sitewide, not a display/body pairing. Two separate next/font
// instances (rather than sharing one) since each needs its own CSS
// variable name; both point at the same file, which the build emits once.
//
// Self-hosted rather than next/font/google: that fetches the font from
// Google at build time, so an unreachable fonts.gstatic.com fails the
// whole deploy (it did, 2026-10-21). One variable file covers 400-700.
const interDisplay = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  variable: "--font-display",
  weight: "400 700",
  style: "normal",
  display: "swap",
});

const interBody = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  variable: "--font-body",
  weight: "400 700",
  style: "normal",
  display: "swap",
});

const DEFAULT_DESCRIPTION =
  "Coaches, consultants, and service providers grow with custom AI agents, marketing automation, and no-fluff courses.";

export async function generateMetadata(): Promise<Metadata> {
  const identity = await getSiteIdentity();
  const name = resolveSiteName(identity);
  const description = identity.description || DEFAULT_DESCRIPTION;
  const ogImage = identity.ogImageUrl || `${assetUrl("brand/og-default.png")}?v=${OG_ASSET_VERSION}`;
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: identity.metaTitle || name,
      template: `%s | ${name}`,
    },
    description,
    // Favicon/apple-icon come from icon.tsx / apple-icon.tsx instead of
    // here. Next's metadata resolver always puts a static icon file
    // (icon.png, favicon.ico) ahead of whatever this `icons` field says,
    // so setting it here was silently a no-op as long as those static
    // files also existed -- see icon.tsx for the full explanation.
    openGraph: {
      type: "website",
      url: SITE_URL,
      siteName: name,
      locale: OG_LOCALE,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${name} homepage`,
        },
      ],
    },
  };
}

/** Every field comes from the console-edited business profile and is left
 * out when empty, so a fresh install never publishes placeholder contact
 * details to search engines. */
function buildOrgJsonLd(business: ResolvedBusiness, sameAs: string[], siteName: string, logoUrl: string) {
  const address = business.address;
  const hasAddress = Boolean(address.line1 || address.city || address.postalCode);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: siteName,
    url: SITE_URL,
    logo: logoUrl || assetUrl("brand/org-logo.png"),
    legalName: business.brand,
    ...(business.email ? { email: business.email } : {}),
    ...(business.phone ? { telephone: business.phone } : {}),
    ...(business.email || business.phone
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer support",
            ...(business.email ? { email: business.email } : {}),
            ...(business.phone ? { telephone: business.phone } : {}),
            ...(address.countryCode ? { areaServed: address.countryCode } : {}),
            availableLanguage: ["en"],
          },
        }
      : {}),
    ...(business.founderSlug && business.ownerName
      ? {
          founder: {
            "@type": "Person",
            "@id": `${SITE_URL}/author/${business.founderSlug}#person`,
            name: business.ownerName,
            url: `${SITE_URL}/author/${business.founderSlug}`,
          },
        }
      : {}),
    ...(hasAddress
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: [address.line1, address.line2].filter(Boolean).join(", "),
            addressLocality: address.city,
            postalCode: address.postalCode,
            addressRegion: address.state,
            addressCountry: address.countryCode,
          },
        }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}
const websiteJsonLd = (siteName: string) => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: siteName,
  url: SITE_URL,
  publisher: { "@id": `${SITE_URL}/#organization` },
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [business, chrome, identity, homepage, theme] = await Promise.all([
    getBusiness(),
    getSiteChrome(),
    getSiteIdentity(),
    getPublishedPage("/"),
    getSiteTheme(),
  ]);
  // getPublishedPage("/") is request-deduplicated (see sitePages.ts's
  // `cache()` wrapper) so this doesn't add a second DB round trip beyond
  // the one page.tsx already makes for the same request.
  const siteIsLive = Boolean(homepage);
  const siteName = resolveSiteName(identity);
  const orgJsonLd = buildOrgJsonLd(business, Object.values(chrome.socials).filter((v): v is string => Boolean(v)), siteName, identity.logoUrl);
  return (
    <html
      lang="en"
      className={`${interDisplay.variable} ${interBody.variable} h-full overflow-x-hidden antialiased`}
    >
      <head>
        {/* Overrides globals.css's static :root defaults and gradient
            classes with this deployment's live theme (Console -> Site
            Settings -> Theme), read fresh from the DB on every request --
            unlike the old NEXT_PUBLIC_COLOR_* env vars, a change here is
            live immediately, no rebuild or redeploy. No-op (identical
            values) on an unconfigured install. */}
        <style>{siteThemeCss(theme)}</style>
      </head>
      <body className="flex min-h-full flex-col overflow-x-hidden bg-paper text-ink">
        {/* TURNSTILE_SITE_KEY is a bare (non-NEXT_PUBLIC_) env var, read
            live here on every request and handed to the browser this way
            instead -- a NEXT_PUBLIC_ var would freeze to empty at CI build
            time on this generic self-host image (same bug class as
            everything else this project fixed), which is exactly what was
            happening: the widget never rendered, so no form ever produced
            a token, so every captcha-gated submission (login, signup,
            contact, newsletter, reviews, directory, webinar registration)
            failed server-side verification. See src/components/
            Turnstile.tsx, which reads this on mount. */}
        <script
          id="turnstile-config"
          dangerouslySetInnerHTML={{ __html: `window.__TURNSTILE_SITE_KEY__ = ${JSON.stringify(process.env.TURNSTILE_SITE_KEY || "")};` }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(orgJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd(siteName)) }}
        />
        <PublicSiteOnly suppressOnHome={!siteIsLive}><Nav /></PublicSiteOnly>
        <main className="flex-1">{children}</main>
        <PublicSiteOnly suppressOnHome={!siteIsLive}><Footer /></PublicSiteOnly>
        {/* Sitewide early-bird promo, temporary -- remove this one line
            (and optionally the component file) to take it down. */}
        <PublicSiteOnly suppressOnHome={!siteIsLive}><EarlyBirdBanner /></PublicSiteOnly>
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
        {/* Tried moving Meta Pixel to Cloudflare Zaraz (2026-08-20) but Zaraz's
            managed Facebook Pixel tool runs server-to-server only and never
            sets the _fbp/_fbc cookies metaCapi.ts needs for good Conversions
            API match quality, confirmed by clearing cookies and reloading
            with Zaraz active. Reverted, Zaraz tool disabled in the dashboard.

            2026-08-20 (interaction-deferred loading): GA4/gtag.js and Meta
            Pixel's fbevents.js were the two heaviest main-thread scripts in
            every PSI trace (Facebook ~339ms, GTM/gtag ~186ms), well above
            first-party app code (~78ms). next/script lazyOnload already
            deferred them to ~4.7-5.4s, but Lighthouse's lab trace still
            counted that time. This defines the gtag/fbq queue stubs
            synchronously (near-zero cost, no network) so every trackEvent()/
            trackMetaEvent() call anywhere in the app is queued correctly no
            matter when it fires, then only fetches the real gtag.js/
            fbevents.js files on the visitor's first scroll/pointerdown/
            keydown/touchstart, or after a 5s fallback timer if they never
            interact -- so a slow reader who never touches the page still
            gets tracked, just a few seconds later than before. Conversion
            events (ViewContent/Purchase/etc, all fired from trackMetaEvent
            on click handlers) load the real script immediately since a
            click is itself a trigger. Do not remove the fallback timer --
            without it, a visitor who reads and leaves without interacting
            would never be tracked at all. */}
        <Script id="tracking-init" strategy="afterInteractive">
          {`
            (function() {
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              ${process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ? `
              if (!window.location.pathname.startsWith('/console')) {
                gtag('js', new Date());
                gtag('config', '${process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID}', { send_page_view: false });
              }
              ` : ""}
              ${process.env.NEXT_PUBLIC_META_PIXEL_ID ? `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[]}(window, document, 'script');
              fbq('init', '${process.env.NEXT_PUBLIC_META_PIXEL_ID}');
              fbq('track', 'PageView');
              ` : ""}

              var trackingLoaded = false;
              function loadTrackingScripts() {
                if (trackingLoaded) return;
                trackingLoaded = true;
                clearTimeout(fallbackTimer);

                ${process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ? `
                var gtagScript = document.createElement('script');
                gtagScript.async = true;
                gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID}';
                document.head.appendChild(gtagScript);
                ` : ""}

                ${process.env.NEXT_PUBLIC_META_PIXEL_ID ? `
                var fbScript = document.createElement('script');
                fbScript.async = true;
                fbScript.src = 'https://connect.facebook.net/en_US/fbevents.js';
                document.head.appendChild(fbScript);
                ` : ""}
              }

              ['scroll', 'pointerdown', 'keydown', 'touchstart'].forEach(function(evt) {
                window.addEventListener(evt, loadTrackingScripts, { passive: true, once: true });
              });
              var fallbackTimer = setTimeout(loadTrackingScripts, 5000);
            })();
          `}
        </Script>
      </body>
    </html>
  );
}
