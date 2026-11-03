import { escapeHtml } from "@/lib/escapeHtml";
import { sanitizeBlogHtml } from "@/lib/sanitizeBlogHtml";

const HTML_TAG_PATTERN = /<[a-z][\s\S]*>/i;
const STEP_TAG_PATTERN = /<div[^>]*data-guide-step=""[^>]*><\/div>/g;

export const GUIDE_BODY_IMAGE_PREFIX = "prompt-guides/body";

function wrapPlainTextAsHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/** Guides written before the rich editor existed stored plain text with no
 * HTML at all -- detect that case and wrap it into paragraphs before
 * sanitizing, so blank lines still read as paragraph breaks. Anything that
 * already looks like HTML (every guide saved through the rich editor)
 * passes through untouched. */
function normalizeToHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return HTML_TAG_PATTERN.test(trimmed) ? trimmed : wrapPlainTextAsHtml(trimmed);
}

/** Every <img src="..."> in a guide body that points at this guide's own
 * R2 image prefix -- used to diff old vs new body HTML on save so images
 * the admin removed from the editor get deleted from R2 too, instead of
 * accumulating as orphans forever. */
export function extractGuideBodyImageUrls(html: string | null | undefined): string[] {
  if (!html) return [];
  const urls: string[] = [];
  const pattern = /<img[^>]+src="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    if (match[1].includes(`/${GUIDE_BODY_IMAGE_PREFIX}/`)) urls.push(match[1]);
  }
  return urls;
}

export type GuideBodyStep = {
  itemType: "prompt" | "skill";
  refId: number | null;
  timestampLabel: string;
  instruction: string;
};

export type GuideBodySegment = { type: "html"; html: string } | { type: "step"; step: GuideBodyStep };

function readAttr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : "";
}

export function hasGuideStepMarkers(raw: string | null | undefined): boolean {
  return Boolean(raw && raw.includes('data-guide-step=""'));
}

/** Splits a guide's raw body HTML into alternating prose/step segments, in
 * document order -- the step editor lives inline in the rich-text body (a
 * step is just a node in the document, marked with data-guide-step), so
 * this is what lets the public page render each step's interactive card
 * (copy button, etc.) exactly where the admin placed it in the write-up,
 * instead of every step being lumped together at the bottom.
 *
 * Guides saved before steps moved inline have no markers at all -- those
 * fall back to a single HTML segment and the page renders their items the
 * old way (queried from prompt_guide_items directly). */
export function splitGuideBody(raw: string | null | undefined): GuideBodySegment[] {
  const html = raw || "";
  if (!hasGuideStepMarkers(html)) {
    const normalized = normalizeToHtml(html);
    return normalized ? [{ type: "html", html: sanitizeBlogHtml(normalized) }] : [];
  }

  const segments: GuideBodySegment[] = [];
  let lastIndex = 0;
  const pattern = new RegExp(STEP_TAG_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const chunk = html.slice(lastIndex, match.index);
    if (chunk.trim()) segments.push({ type: "html", html: sanitizeBlogHtml(chunk) });

    const tag = match[0];
    const itemType = readAttr(tag, "data-item-type") === "skill" ? "skill" : "prompt";
    const refIdRaw = Number(readAttr(tag, "data-ref-id"));
    segments.push({
      type: "step",
      step: {
        itemType,
        refId: Number.isInteger(refIdRaw) && refIdRaw > 0 ? refIdRaw : null,
        timestampLabel: readAttr(tag, "data-timestamp"),
        instruction: decodeURIComponent(readAttr(tag, "data-instruction") || ""),
      },
    });
    lastIndex = match.index + tag.length;
  }
  const tail = html.slice(lastIndex);
  if (tail.trim()) segments.push({ type: "html", html: sanitizeBlogHtml(tail) });
  return segments;
}
