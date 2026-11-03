import sanitizeHtml from "sanitize-html";
import { sanitizeBlogHtml } from "@/lib/sanitizeBlogHtml";
import { resolveImage } from "@/lib/images";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/config/brand";
// Enough for a Substack/Medium-style teaser, not the whole article --
// whole paragraphs only, never cut mid-sentence.
const PREVIEW_MIN_WORDS = 120;
const PREVIEW_MAX_PARAGRAPHS = 4;

type NewsletterSourcePost = {
  title: string;
  slug: string;
  html: string;
  feature_image: string | null;
  custom_excerpt: string | null;
};

function wordCount(html: string): number {
  return html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function previewFromHtml(html: string): string {
  // Only real <p> paragraphs, in order -- a naive "split on </p>" would also
  // sweep in interspersed <figure>/<img> captions, leaving their text
  // orphaned once the stricter allowlist below strips the wrapping tags.
  const paragraphs = html.match(/<p[^>]*>[\s\S]*?<\/p>/g) || [];
  let out = "";
  let words = 0;
  let count = 0;
  for (const block of paragraphs) {
    if (out && words >= PREVIEW_MIN_WORDS) break;
    if (count >= PREVIEW_MAX_PARAGRAPHS) break;
    out += block;
    words += wordCount(block);
    count++;
  }
  // Emails don't render iframes/tables/svg reliably -- an intro teaser
  // should never need them, so drop anything heavier than basic text markup.
  const cleaned = sanitizeHtml(out, {
    allowedTags: ["p", "br", "strong", "em", "b", "i", "a", "u"],
    allowedAttributes: { a: ["href", "title", "target", "rel"] },
    allowedSchemes: ["https", "mailto"],
  });
  // Site-relative links (internal tag/post references) have no page to
  // resolve against inside an email client -- make them absolute.
  return cleaned.replace(/href="\/(?!\/)/g, `href="${SITE_URL}/`);
}

/** Builds a Substack/Medium-style newsletter body from a blog post: excerpt,
 * an opening-paragraph teaser, and a tracked "read the full post" button. */
export function buildNewsletterHtmlFromPost(post: NewsletterSourcePost): string {
  const fullHtml = sanitizeBlogHtml(post.html.replaceAll("__GHOST_URL__", SITE_URL));
  const preview = previewFromHtml(fullHtml);
  const img = resolveImage(post.feature_image);
  const postUrl = `${SITE_URL}/blog/${post.slug}?utm_source=newsletter&utm_medium=email&utm_campaign=${encodeURIComponent(post.slug)}`;
  const title = escapeHtml(post.title);

  const parts: string[] = [];
  if (img) {
    parts.push(`<p><img src="${img}" alt="${title}" style="max-width:100%;border-radius:12px;"></p>`);
  }
  if (post.custom_excerpt) {
    parts.push(`<p style="font-size:17px;color:#4b4b4b;line-height:1.6;"><em>${escapeHtml(post.custom_excerpt)}</em></p>`);
  }
  parts.push(preview);
  parts.push(
    `<p style="margin-top:24px;"><a href="${postUrl}" class="email-cta" style="display:inline-block;white-space:nowrap;background:#0a0a0a;color:#f7f4f0;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Read the full post &rarr;</a></p>`
  );
  return parts.join("\n");
}
