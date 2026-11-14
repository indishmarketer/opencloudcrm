/** Turns an email's blocks (src/lib/emailBlocks.ts) into the HTML fragment
 * that becomes `body_html` -- the exact same contract every email surface
 * already reads (src/lib/email.ts's sendEmail(), the campaign editor's
 * template-copy, etc). Nothing downstream needs to change: this function
 * is the only new thing, slotting in wherever a template's body_html used
 * to come from a rich-text editor instead.
 *
 * Every block renders as `<table role="presentation">`/`<tr>`/`<td>` with
 * inline `style="..."` only -- no `<div>` layout, no CSS classes, nothing
 * that depends on a `<style>` block mail clients may strip (Outlook's Word
 * engine in particular). This is a plain, pure function: given the same
 * blocks and vars, always the same string. No server-only imports, so it
 * can run in a plain node test exactly like src/lib/pageBlocks.ts's
 * renderer-adjacent helpers.
 *
 * A block's rich-text fields (Text/Columns' `html`) are expected to
 * already be sanitized HTML by the time they reach here -- the server
 * caller that saves a template is responsible for that (sanitize-html is
 * too heavy to ship to the browser), exactly like pageBlocks.ts's own
 * richtext fields. */

import { escapeHtml } from "@/lib/escapeHtml";
import type { EmailBlock } from "@/lib/emailBlocks";

/** Raw {{var}} substitution, not auto-escaping -- same contract as
 * emailTemplates.ts's applyTemplateVars (every var passed in must already
 * be HTML-safe). Duplicated rather than imported: that file also imports
 * the DB pool, which this pure-render module must never pull in. */
function applyVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

/** Absolute links only -- unlike pageBlocks.ts's safeHref, a relative
 * "/contact" is useless once the markup leaves the site inside an email. */
function safeEmailHref(value: unknown): string {
  const href = typeof value === "string" ? value.trim().slice(0, 500) : "";
  return /^(https:\/\/|mailto:|tel:)/i.test(href) ? href : "";
}

function str(props: Record<string, unknown>, key: string, fallback = ""): string {
  const v = props[key];
  return typeof v === "string" ? v : fallback;
}
function num(props: Record<string, unknown>, key: string, fallback: number): number {
  const v = props[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function px(value: number): string {
  return `${Math.round(value)}px`;
}

/** The padding/background/alignment every block shares -- one `<td>`'s
 * worth of inline style, built once instead of per block type. */
function cellStyle(props: Record<string, unknown>, extra = ""): string {
  const bg = str(props, "backgroundColor");
  const paddingY = num(props, "paddingY", 12);
  const paddingX = num(props, "paddingX", 24);
  const align = str(props, "align", "left");
  return (
    `padding:${px(paddingY)} ${px(paddingX)};text-align:${align};` +
    (bg ? `background-color:${bg};` : "") +
    extra
  );
}

function textStyle(props: Record<string, unknown>): string {
  const color = str(props, "textColor");
  const fontSize = num(props, "fontSize", 16);
  const fontWeight = str(props, "fontWeight", "normal");
  return `font-family:Helvetica,Arial,sans-serif;font-size:${px(fontSize)};font-weight:${fontWeight};line-height:1.6;` + (color ? `color:${color};` : "color:#1a1a1a;");
}

/** One `<tr><td>` wrapper around a block's own content -- every block
 * renders through this, so the shared padding/background/alignment never
 * has to be repeated per type. */
function row(innerHtml: string, cellAttrs: string): string {
  return `<tr><td ${cellAttrs}>${innerHtml}</td></tr>`;
}

function renderHeading(props: Record<string, unknown>, vars: Record<string, string>): string {
  const text = escapeHtml(applyVars(str(props, "text"), vars));
  return row(`<h1 style="margin:0;${textStyle(props)}">${text}</h1>`, `style="${cellStyle(props)}"`);
}

function renderText(props: Record<string, unknown>, vars: Record<string, string>): string {
  const html = applyVars(str(props, "html"), vars);
  return row(`<div style="${textStyle(props)}">${html}</div>`, `style="${cellStyle(props)}"`);
}

function renderImage(props: Record<string, unknown>): string {
  const src = str(props, "src");
  if (!src) return "";
  const alt = escapeHtml(str(props, "alt"));
  const width = num(props, "width", 0);
  const widthAttr = width > 0 ? ` width="${Math.round(width)}"` : "";
  const widthStyle = width > 0 ? `width:${px(width)};max-width:100%;` : "max-width:100%;";
  const img = `<img src="${escapeHtml(src)}" alt="${alt}"${widthAttr} style="${widthStyle}height:auto;border:0;display:block;margin:${str(props, "align") === "center" ? "0 auto" : "0"};">`;
  const href = safeEmailHref(props.href);
  const content = href ? `<a href="${href}" style="text-decoration:none;">${img}</a>` : img;
  return row(content, `style="${cellStyle(props)}"`);
}

function renderButton(props: Record<string, unknown>, vars: Record<string, string>): string {
  const label = escapeHtml(applyVars(str(props, "label"), vars));
  const href = safeEmailHref(applyVars(str(props, "href"), vars));
  if (!href || !label) return "";
  const buttonColor = str(props, "buttonColor", "#0a0a0a");
  const buttonTextColor = str(props, "buttonTextColor", "#ffffff");
  const radius = num(props, "borderRadius", 6);
  // The bulletproof-button pattern: a table, not an <a> with padding --
  // Outlook renders an anchor's own padding/border-radius inconsistently,
  // but always renders a table cell's.
  const button =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${str(props, "align") === "center" ? "0 auto" : str(props, "align") === "right" ? "0 0 0 auto" : "0"};">` +
    `<tr><td style="border-radius:${px(radius)};background-color:${buttonColor};">` +
    `<a href="${href}" style="display:inline-block;padding:12px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:${buttonTextColor};text-decoration:none;border-radius:${px(radius)};">${label}</a>` +
    `</td></tr></table>`;
  return row(button, `style="${cellStyle(props)}"`);
}

function renderDivider(props: Record<string, unknown>): string {
  const lineColor = str(props, "lineColor", "#e2e2e0");
  return row(`<div style="border-top:1px solid ${lineColor};line-height:0;font-size:0;">&nbsp;</div>`, `style="${cellStyle(props)}"`);
}

function renderSpacer(props: Record<string, unknown>): string {
  const height = num(props, "height", 24);
  return `<tr><td style="font-size:0;line-height:0;height:${px(height)};">&nbsp;</td></tr>`;
}

function renderColumns(props: Record<string, unknown>, vars: Record<string, string>): string {
  const left = applyVars(str(props, "leftHtml"), vars);
  const right = applyVars(str(props, "rightHtml"), vars);
  const style = textStyle(props);
  // A table-based 2-up layout, each column its own <td valign="top"> at
  // 50% width -- stacks naturally on a narrow (mobile) client the same
  // way a page's Columns block does, with no media query required: a
  // mail client that ignores the viewport just keeps them side by side,
  // which still reads fine at this width.
  const columns =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td valign="top" width="50%" style="${style}padding-right:12px;">${left}</td>` +
    `<td valign="top" width="50%" style="${style}padding-left:12px;">${right}</td>` +
    `</tr></table>`;
  return row(columns, `style="${cellStyle(props)}"`);
}

const SOCIAL_LABELS: Record<string, string> = { facebook: "Facebook", x: "X", instagram: "Instagram", linkedin: "LinkedIn" };

function renderSocialIcons(props: Record<string, unknown>): string {
  const iconColor = str(props, "iconColor", "#6b6b6b");
  const links = (["facebook", "x", "instagram", "linkedin"] as const)
    .map((platform) => ({ platform, href: safeEmailHref(props[platform]) }))
    .filter((l) => l.href);
  if (!links.length) return "";
  const cells = links
    .map(
      ({ platform, href }) =>
        `<td style="padding:0 8px;"><a href="${href}" style="color:${iconColor};text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;">${SOCIAL_LABELS[platform]}</a></td>`,
    )
    .join("");
  const table = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${str(props, "align") === "center" ? "0 auto" : "0"};"><tr>${cells}</tr></table>`;
  return row(table, `style="${cellStyle(props)}"`);
}

/** Preview-only inside the builder (see emailBlocks.ts's doc comment on
 * the "footer" type) -- the real footer is injected server-side by
 * src/lib/email.ts's withFooter() after this HTML is generated, using the
 * same colours this block's style fields write into the template's
 * stored footerStyle. This function never renders into the actual
 * body_html; it exists so the builder's canvas can show an accurate
 * preview of something that isn't really a block in the saved output. */
export function renderFooterPreview(props: Record<string, unknown>, businessName: string, address: string): string {
  const textColor = str(props, "textColor", "#6b6b6b");
  const linkColor = str(props, "linkColor", "#dc2626");
  const addressLine = address ? ` &middot; ${escapeHtml(address)}` : "";
  return (
    `<div style="padding:20px 24px;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${textColor};">` +
    `${escapeHtml(businessName)}${addressLine}<br>` +
    `<a href="#" style="color:${linkColor};text-decoration:underline;">Unsubscribe</a>` +
    `</div>`
  );
}

const RENDERERS: Record<string, (props: Record<string, unknown>, vars: Record<string, string>) => string> = {
  heading: renderHeading,
  text: renderText,
  image: (p) => renderImage(p),
  button: renderButton,
  divider: (p) => renderDivider(p),
  spacer: (p) => renderSpacer(p),
  columns: renderColumns,
  socialIcons: (p) => renderSocialIcons(p),
  // The footer block contributes nothing to body_html -- see
  // renderFooterPreview's doc comment. Its props are read separately
  // (Phase 4: saved onto the template as footerStyle, applied by
  // withFooter() at send time), not rendered inline with the body.
  footer: () => "",
};

/** The full email body fragment: one `<table>` of rows, each block its own
 * row, in order. This -- not any individual block -- is what becomes
 * `body_html`. */
export function renderEmailBlocksToHtml(blocks: EmailBlock[], vars: Record<string, string> = {}): string {
  const rows = blocks
    .map((block) => RENDERERS[block.type]?.(block.props, vars) ?? "")
    .filter(Boolean)
    .join("");
  if (!rows) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}
