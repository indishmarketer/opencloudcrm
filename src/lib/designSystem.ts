import { cache } from "react";
import { pool } from "@/lib/db";
import { CSP_DIRECTIVES } from "@/config/csp";
import { imageGenerationStatus } from "@/lib/imageGeneration";
import {
  COLOR_INK,
  COLOR_INK_SOFT,
  COLOR_LINE,
  COLOR_PAPER,
  COLOR_PAPER_SOFT,
  SITE_NAME,
} from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";

/** What an API/MCP client needs in order to design a page section from
 * scratch and still have it look like it belongs to this site.
 *
 * This exists because of a specific failure: handed only the section
 * library, a client reasonably assumed those sections *were* the design
 * system, so every "make me a page" came out as the homepage again with
 * the words swapped -- a hero, then cards, then an FAQ, each locked to
 * its own fixed layout, with a landscape image squeezed into the hero's
 * portrait frame. The library is a convenience, not the only way to build
 * a page. The way out is the "custom" block (hand-written HTML + a real
 * scoped stylesheet), and for that to produce something on-brand rather
 * than generic-AI-purple, the client has to be told the actual palette,
 * the actual fonts, the actual CSS variables, and the handful of real
 * constraints the platform imposes. That is all this returns.
 *
 * Everything here is derived -- env-configured brand values, the CSS
 * variables that genuinely exist in globals.css, the CSP this deployment
 * actually sends -- except `notes`, which is free text the site owner
 * writes for their own deployment and which lives in the database (see
 * readDesignNotes), not in this repo. */

export const DESIGN_NOTES_KEY = "design_notes";
export const MAX_DESIGN_NOTES = 4000;

/** Owner-written brand direction for this deployment: whatever a human
 * designer would be told before starting ("two colors only", "no rounded
 * corners", "never use stock photography of people"). Deployment content,
 * so it is stored in site_settings and edited through the API/console --
 * this repo ships no opinion of its own about any one site's brand. */
export const readDesignNotes = cache(async (): Promise<string> => {
  try {
    const result = await pool.query<{ value: string }>("SELECT value FROM site_settings WHERE key = $1", [DESIGN_NOTES_KEY]);
    return result.rows[0]?.value ?? "";
  } catch {
    // Migrations not run yet, or a DB hiccup. Brand notes are advisory;
    // never fail the whole design-system read over them.
    return "";
  }
});

export async function saveDesignNotes(notes: string): Promise<string> {
  const value = notes.slice(0, MAX_DESIGN_NOTES);
  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [DESIGN_NOTES_KEY, value]
  );
  return value;
}

/** Hosts a browser is allowed to load things from, read off the same
 * next.config.ts CSP the site actually serves rather than restated here,
 * so this can't drift out of date and quietly send a client off to build
 * a section around a script that will be blocked on arrival. */
function cspHosts(): Record<string, string[]> {
  const directives: Record<string, string[]> = {};
  for (const directive of CSP_DIRECTIVES) {
    const [name, ...values] = directive.trim().split(/\s+/);
    if (name) directives[name] = values.filter((value) => value.startsWith("http"));
  }
  return directives;
}

export async function describeDesignSystem() {
  const notes = await readDesignNotes();
  const csp = cspHosts();

  return {
    site: { name: SITE_NAME, url: SITE_URL },

    /** The palette, as the deployment configures it. These five are the
     * whole set -- there is no secondary/accent scale to reach for. */
    colors: {
      ink: { value: COLOR_INK, cssVar: "var(--ink)", use: "Primary text, and the background of any dark section." },
      paper: { value: COLOR_PAPER, cssVar: "var(--paper)", use: "Page background, and text on top of ink." },
      paperSoft: { value: COLOR_PAPER_SOFT, cssVar: "var(--paper-soft)", use: "A tinted band to separate one section from the next." },
      inkSoft: { value: COLOR_INK_SOFT, cssVar: "var(--ink-soft)", use: "Secondary/supporting text." },
      line: { value: COLOR_LINE, cssVar: "var(--line)", use: "Borders, rules, card outlines." },
    },

    typography: {
      displayFont: { cssVar: "var(--font-display)", use: "Headings. Already applied to h1-h4 by the site's own stylesheet." },
      bodyFont: { cssVar: "var(--font-body)", use: "Body copy. Already applied to <body>, so it is inherited." },
      note: "Both variables are live on :root and usable from a custom section's CSS. Loading a different webfont is possible but needs the font's host added to the CSP's font-src, so prefer these two.",
    },

    /** The real numbers behind the pre-made sections, so a hand-built
     * section can line up with the ones above and below it instead of
     * floating at its own arbitrary width. */
    layout: {
      contentWidth: "72rem (max-w-6xl) -- the standard column every stock section uses.",
      wideWidth: "80rem (max-w-7xl)",
      horizontalPadding: "1.5rem (24px) at every breakpoint",
      sectionPadding: "2.5rem top and bottom on mobile, 4rem from the md breakpoint up",
      breakpoints: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px" },
      note: "A custom block set to width 'full' gets the whole viewport with none of this padding, for a design that owns its own container.",
    },

    cssVariables: ["--ink", "--paper", "--paper-soft", "--ink-soft", "--line", "--font-display", "--font-body"],

    /** The things that will silently not work, each with what to do
     * instead. Every one of these has actually bitten someone. */
    constraints: [
      "A custom section must NOT contain <header>, <nav>, <footer>, <main>, <html>, <head>, <body> or <title>, and must not draw the site's logo. This site renders its real header (with the real logo and the real menu) and its real footer around every single page already, so a section carrying its own gives the visitor two headers, two logos and two footers stacked up, and forks the navigation so the hand-written copy goes stale the moment the real menu changes. Build only the band of the page your section is: open with <section> or <div> and go straight into its content. A save containing any of those tags is rejected outright, naming them. Links to other pages are fine; a navigation bar is not.",
      "Tailwind utility classes do NOT work inside a custom block's HTML. Tailwind generates only the classes it can see written in this app's own source at build time, so class=\"grid grid-cols-3 gap-8\" stored in the database resolves to nothing at all. Write real CSS in the block's css field instead -- that is what the field is for.",
      "A custom block's CSS is automatically scoped to that one section, so you can safely style bare element selectors (h2, p, a, ul) and short class names without worrying about the rest of the site.",
      "@keyframes and @font-face are hoisted out of that scope (they are only legal at a stylesheet's top level), so prefix keyframe names to avoid colliding with another custom section on the same page.",
      "eval() and new Function() are blocked by the site's Content-Security-Policy (no 'unsafe-eval'). Inline <script> tags and the block's js field are fine.",
      "An external script or stylesheet needs its host in the CSP first, or the browser drops it with no visible symptom beyond the feature not working. Self-contained HTML/CSS/JS avoids the whole problem.",
      "Images must be served from an allowed host, so every image a section uses has to go through the Media Library first -- see the images section below for the two ways to put one there. Inline <svg> markup written directly into the section's HTML also works and needs no upload at all; it is often the better answer for an icon, a logo mark, a diagram or a decorative shape, since it stays sharp at any size and costs no request.",
      "A page holds at most 60 blocks.",
    ],

    allowedHosts: {
      images: csp["img-src"] ?? [],
      scripts: csp["script-src"] ?? [],
      frames: csp["frame-src"] ?? [],
      note: "Anything not listed is blocked by the Content-Security-Policy. 'self', data: and inline content are always allowed.",
    },

    /** Getting a real image into a page, which is its own problem: the
     * bytes can never travel through the model, so both of these move
     * only text and let the server do the rest. */
    images: {
      generateFromAPrompt: {
        tool: "generate_media_image",
        use: "Any photographic or illustrative image. The server generates it with this deployment's own provider key and saves it to the Media Library, so only your prompt travels. This is the one that works from a hosted chat client, where an image your own built-in image tool made has no public URL to hand over.",
        ...imageGenerationStatus(),
      },
      drawItYourself: {
        tool: "upload_media_image",
        parameter: "svg",
        use: "An image you construct rather than photograph: a chart, a diagram, a title card, a logo lockup, a framed layout. You write the SVG, the server rasterizes it. Works from any client, needs no provider key, costs nothing, and gives you exact control -- so it is the right default for anything geometric or typographic.",
      },
      reuseSomethingOnline: { tool: "upload_media_image", parameter: "sourceUrl", use: "An image that already has a public URL. The server downloads it itself." },
      alreadyUploaded: { tool: "list_media_images", use: "Browse what is already in the library before making another one." },
      aspectRatio:
        "Ask for the shape the design needs rather than cropping a square into it. A wide hero band wants a landscape image; a portrait frame wants a portrait one. Mismatched aspect ratios are the most visible way a generated image looks wrong on a page.",
      note: "Never put an image URL from somewhere else straight into a page: the Content-Security-Policy will block it and the image renders broken with no other symptom.",
    },

    /** Advice about process rather than pixels: the point the old
     * behaviour kept missing. */
    howToDesignAPage: [
      "Decide the design first, then pick blocks to realise it -- not the other way round. Composing the stock hero + cards + faq sections will always produce something that looks like every other page on the site, because they are the same sections those pages use.",
      "For anything bespoke, use one 'custom' block per section of the design, with your own HTML and CSS. Mix in stock blocks only where one genuinely fits (a contact form, the live blog feed, the newsletter signup -- things wired to real data you cannot hand-write).",
      "Build sections, not pages. Each custom block is one horizontal band of the design -- a hero band, then a feature band, then a CTA band -- so a page is several blocks you can reorder, restyle and edit one at a time. One giant block holding the whole page is the thing to avoid: it cannot be reordered, it tempts you into writing a header and footer that duplicate the site's own, and every later edit means rewriting the lot.",
      "Design to the content. An image's own aspect ratio decides its frame; do not pour a landscape photo into a layout built for a portrait one. Generate it at the shape you need.",
      "Stay inside the palette and the two fonts above. Within that, the layout, spacing rhythm, grid, borders, shadows, transitions and animation are yours to invent.",
      "Set metaTitle and metaDescription, and give every image real alt text.",
      "Check it before publishing. update_page only saves a draft, so nothing is live yet; get_page reads the page back after normalization, which is how you confirm nothing was dropped or truncated; /preview/page/<id> shows the draft in a browser (console login required); publish_page makes it live.",
    ],

    brandNotes: notes || null,
    brandNotesHint: notes ? undefined : "The site owner has not written any brand direction yet. Set it with update_design_notes so every future page build follows it.",
  };
}
