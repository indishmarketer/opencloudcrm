/** What a fresh install's pages contain before anyone edits them.
 *
 * STARTER_PAGES are created once, as real (editable, deletable) pages, the
 * first time the site needs them (src/lib/sitePages.ts). They are neutral
 * on purpose: this file ships in a public repo, so it must never contain
 * one particular business's copy. Every deployment replaces this text
 * from Console -> Pages (or imports its own pages file).
 *
 * BUILT_IN_PAGES are app routes that have their own functionality (the
 * course list, the tools directory, the legal pages...). They render these
 * default sections until someone edits them; the "builtIn" block marks
 * where the route's own content goes. Editing creates a row; "Reset to
 * default" deletes it again. They can't be deleted, only reset. */

import type { PageBlock } from "@/lib/pageBlocks";
import type { PageSnapshot } from "@/lib/sitePagesShape";

const SECTION = { background: "default", spacing: "normal", anchor: "" };
const block = (id: string, type: string, props: Record<string, unknown> = {}): PageBlock => ({
  id,
  type,
  props: type === "builtIn" ? props : { ...SECTION, ...props },
});
const card = (title: string, text: string, href = "", linkLabel = "", extra: Record<string, string> = {}) => ({
  eyebrow: "",
  title,
  text,
  href,
  linkLabel,
  badge: "",
  image: "",
  imageAlt: "",
  ...extra,
});

export type DefaultPage = PageSnapshot & { path: string; label: string };

const page = (path: string, label: string, snapshot: Partial<PageSnapshot> & { blocks: PageBlock[] }): DefaultPage => ({
  path,
  label,
  title: snapshot.title ?? label,
  metaTitle: snapshot.metaTitle ?? "",
  metaDescription: snapshot.metaDescription ?? "",
  ogImage: snapshot.ogImage ?? "",
  noindex: snapshot.noindex ?? false,
  blocks: snapshot.blocks,
});

export const STARTER_PAGES: DefaultPage[] = [
  page("/", "Home", {
    title: "Home",
    metaDescription: "Welcome to {{site_name}}.",
    blocks: [
      block("home-hero", "hero", {
        eyebrow: "Welcome",
        heading: "A clear headline that says what you do and who it's for",
        text: "One or two sentences on the problem you solve. Edit this page from Console -> Pages.",
        primaryLabel: "Get in touch",
        primaryHref: "/contact",
        primaryAction: "leadMagnet",
        secondaryLabel: "Explore courses",
        secondaryHref: "/courses",
        image: "",
        imageAlt: "",
        theme: "dark",
      }),
      block("home-offer", "cards", {
        heading: "What we do",
        text: "",
        columns: "4",
        style: "outline",
        items: [
          card("Services", "What you do for clients, in a sentence.", "/services", "See services"),
          card("Products", "Ready-to-use products and tools.", "/products", "View products"),
          card("Courses", "Training your customers can take at their own pace.", "/courses", "Explore courses"),
          card("Tools directory", "A curated directory of useful tools.", "/tools", "Browse tools"),
        ],
      }),
      block("home-how", "workflowDemo", { heading: "How it works", text: "A short line on how you work with customers." }),
      block("home-courses", "latestCourses", { heading: "Latest courses", count: 3, linkLabel: "View all", background: "soft" }),
      block("home-blog", "latestPosts", { heading: "From the blog", count: 3, linkLabel: "View all", background: "soft" }),
      block("home-cta", "cta", { heading: "Ready to talk?", text: "", buttonLabel: "Book a call", buttonHref: "/book/discovery-call", secondaryLabel: "", secondaryHref: "", style: "band" }),
    ],
  }),
  page("/about", "About", {
    title: "About",
    metaDescription: "About {{site_name}}: who we are and how we work.",
    blocks: [
      block("about-story", "split", {
        eyebrow: "",
        heading: "About {{site_name}}",
        html: "<p>Tell visitors who you are, why you started, and who you help. A few short paragraphs work best.</p><p>Replace this text and add a photo from Console -> Pages -> About.</p>",
        tags: "",
        buttonLabel: "",
        buttonHref: "",
        image: "",
        imageAlt: "",
        imagePosition: "right",
        headingLevel: "h1",
      }),
      block("about-business", "businessDetails", {
        heading: "Business details",
        intro: "",
        showOwner: true,
        showRegistration: true,
        showAddress: true,
        items: [],
        showContactLink: true,
      }),
    ],
  }),
  page("/services", "Services", {
    title: "Services",
    metaDescription: "Services offered by {{site_name}}.",
    blocks: [
      block("services-header", "pageHeader", { eyebrow: "", heading: "Services", text: "What you offer, and who it's for.", align: "left" }),
      block("services-list", "cards", {
        heading: "",
        text: "",
        columns: "2",
        style: "outline",
        items: [
          card("First service", "What it is and the result a customer gets."),
          card("Second service", "What it is and the result a customer gets."),
          card("Third service", "What it is and the result a customer gets."),
          card("Fourth service", "What it is and the result a customer gets."),
        ],
      }),
      block("services-cta", "cta", { heading: "Tell us what you need.", text: "", buttonLabel: "Book a call", buttonHref: "/book/discovery-call", secondaryLabel: "", secondaryHref: "", style: "card" }),
    ],
  }),
  page("/products", "Products", {
    title: "Products",
    metaDescription: "Products and tools from {{site_name}}.",
    blocks: [
      block("products-header", "pageHeader", { eyebrow: "", heading: "Products", text: "Products and tools you can use today.", align: "left" }),
      block("products-list", "cards", {
        heading: "",
        text: "",
        columns: "2",
        style: "image",
        items: [card("Your first product", "Describe it, then link it to its own page.", "", "", { badge: "Coming soon" })],
      }),
    ],
  }),
  page("/resources", "Free resources", {
    title: "Free Resources",
    metaDescription: "Free resources from {{site_name}}.",
    blocks: [
      block("resources-header", "pageHeader", { eyebrow: "", heading: "Free Resources", text: "Practical material you can use right away.", align: "left" }),
      block("resources-list", "cards", {
        heading: "",
        text: "",
        columns: "3",
        style: "outline",
        items: [
          card("Prompt & Skill Library", "A searchable library of ready-to-use AI prompts and downloadable agent skills.", "/resources/prompt-skill-library", "Open the library"),
          card("Guides", "Short, practical guides.", "", "", { badge: "Coming soon" }),
        ],
      }),
    ],
  }),
  page("/contact", "Contact", {
    title: "Contact Us",
    metaDescription: "Get in touch with {{site_name}}.",
    blocks: [
      block("contact-form", "contactForm", {
        heading: "Contact us",
        text: "Send us a message and we'll get back to you.",
        messageLabel: "How can we help?",
        showDetails: true,
        detailsHeading: "Contact information",
        successHeading: "Thanks, got it.",
        successText: "We'll get back to you shortly.",
      }),
    ],
  }),
];

const builtInOnly = (id: string) => [block(id, "builtIn")];

export const BUILT_IN_PAGES: DefaultPage[] = [
  page("/courses", "Courses", {
    metaTitle: "Courses",
    metaDescription: "Courses from {{site_name}}.",
    blocks: [
      block("courses-header", "pageHeader", { eyebrow: "", heading: "Courses", text: "Learn at your own pace.", align: "left", spacing: "compact" }),
      block("courses-list", "builtIn"),
    ],
  }),
  page("/blog", "Blog", {
    metaTitle: "Blog",
    metaDescription: "Guides and articles from {{site_name}}.",
    blocks: [
      block("blog-header", "pageHeader", { eyebrow: "", heading: "Blog", text: "Guides, tips and updates.", align: "left", spacing: "compact" }),
      block("blog-list", "builtIn"),
    ],
  }),
  page("/reviews", "Reviews", {
    metaTitle: "Reviews",
    metaDescription: "Reviews of {{site_name}} from customers.",
    blocks: [
      block("reviews-header", "pageHeader", { eyebrow: "", heading: "Reviews", text: "What customers say about working with us.", align: "left", spacing: "compact" }),
      block("reviews-list", "builtIn"),
      block("reviews-links", "cards", {
        heading: "",
        text: "",
        columns: "3",
        style: "outline",
        spacing: "compact",
        items: [
          card("Services", "See what we can do for you.", "/services", "See services", { eyebrow: "Work with us" }),
          card("Courses", "Learn at your own pace.", "/courses", "Browse courses", { eyebrow: "Resources" }),
          card("Blog", "Guides, tips and updates.", "/blog", "Read the blog", { eyebrow: "Free" }),
        ],
      }),
      block("reviews-cta", "cta", { heading: "Ready to become our next success story?", text: "", buttonLabel: "Get in touch", buttonHref: "/contact", secondaryLabel: "", secondaryHref: "", style: "card" }),
    ],
  }),
  page("/tools", "Tools directory", {
    metaTitle: "Tools & Software Directory",
    blocks: [
      block("tools-header", "pageHeader", { eyebrow: "", heading: "Tools directory", text: "A curated directory of useful tools.", align: "left", spacing: "compact" }),
      block("tools-directory", "builtIn"),
    ],
  }),
  page("/webinars", "Webinars", {
    metaTitle: "Webinars",
    blocks: [
      block("webinars-header", "pageHeader", { eyebrow: "", heading: "Webinars", text: "Watch sessions at your own pace.", align: "left", spacing: "compact" }),
      block("webinars-list", "builtIn"),
    ],
  }),
  page("/newsletter", "Newsletter", {
    metaTitle: "Newsletter",
    blocks: [
      block("newsletter-header", "pageHeader", { eyebrow: "", heading: "Newsletter", text: "Get updates in your inbox.", align: "left", spacing: "compact" }),
      block("newsletter-benefits", "cards", {
        heading: "",
        text: "",
        columns: "4",
        style: "outline",
        items: [
          card("Actionable tips", "No fluff. Just practical insights you can use."),
          card("Save time", "The best tools, workflows and strategies, curated for you."),
          card("Real-world examples", "Lessons from real work, not just theory."),
          card("Completely free", "No spam. Unsubscribe anytime."),
        ],
      }),
      block("newsletter-page", "builtIn"),
    ],
  }),
  page("/terms", "Terms and Conditions", { metaTitle: "Terms and Conditions", blocks: builtInOnly("terms-text") }),
  page("/privacy-policy", "Privacy Policy", { metaTitle: "Privacy Policy", blocks: builtInOnly("privacy-text") }),
  page("/refund-policy", "Refund Policy", { metaTitle: "Cancellation & Refund Policy", blocks: builtInOnly("refund-text") }),
];

export const BUILT_IN_PATHS = new Set(BUILT_IN_PAGES.map((p) => p.path));

export function getBuiltInDefault(path: string): DefaultPage | undefined {
  return BUILT_IN_PAGES.find((p) => p.path === path);
}

/** The homepage can be edited but never deleted. */
export const UNDELETABLE_PATHS = new Set(["/"]);
