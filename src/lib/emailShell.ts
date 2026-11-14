// The single wrapper every outgoing email passes through (applied inside
// sendEmail(), not per call site) -- turns a bare content fragment into a
// full HTML document with a real <head>. Without this, the provider sends the
// fragment as-is: no viewport meta, no dark-mode safety, no responsive
// breakpoints, which is why a fixed 600px table rendered shrunk-to-fit
// and dark-mode-inverted in the Gmail Android app. This functional part
// (doctype/meta/dark-mode CSS) always applies -- removing it would be a
// deliverability regression, not a flexibility gain.
//
// The brand header strip + accent line + page background ARE configurable
// (brandingEnabled/brandingAlign/brandingAccentColor/brandingBackgroundColor
// from EmailSettings) -- there is no one "correct" branding, so nothing
// here is baked in beyond sensible defaults matching the original look.
//
// [data-ogsc]/[data-ogsb] are Gmail's own markers on elements it has
// auto-dark-mode-inverted -- targeting them is the standard, documented
// way to force colors back for an email that's meant to always be light.
import { SITE_NAME } from "@/config/brand";
import { escapeHtml } from "@/lib/escapeHtml";
import { EMPTY_EMAIL_SETTINGS } from "@/lib/emailSettingsShape";

const BRAND_FONT = "Helvetica, Arial, sans-serif";
const SERIF_FONT = "Georgia, 'Times New Roman', Times, serif";

export function wrapEmailHtml(bodyHtml: string, opts?: {
  serif?: boolean;
  brandName?: string;
  brandingEnabled?: boolean;
  brandingAlign?: "left" | "center";
  accentColor?: string;
  backgroundColor?: string;
}): string {
  const bodyFont = opts?.serif ? SERIF_FONT : BRAND_FONT;
  // SITE_NAME is a NEXT_PUBLIC_ constant, frozen into the image at build
  // time -- it's the generic "My Business" placeholder on every self-host
  // that hasn't set that env var. sendEmail() already fetches the real,
  // live business name (business.brand, from the DB) for the footer right
  // next to where it calls this function, but never passed it in here, so
  // the brand strip at the top of every single email showed the frozen
  // placeholder regardless of what the owner had actually set.
  const brandName = escapeHtml(opts?.brandName || SITE_NAME);
  const brandingEnabled = opts?.brandingEnabled ?? EMPTY_EMAIL_SETTINGS.brandingEnabled;
  const align = opts?.brandingAlign || EMPTY_EMAIL_SETTINGS.brandingAlign;
  const accentColor = opts?.accentColor || EMPTY_EMAIL_SETTINGS.brandingAccentColor;
  const backgroundColor = opts?.backgroundColor || EMPTY_EMAIL_SETTINGS.brandingBackgroundColor;
  const pageBackground = brandingEnabled ? backgroundColor : "#f4f1ec";
  const headerRow = brandingEnabled
    ? `<tr>
          <td class="email-padding" style="padding:32px 40px 4px 40px;font-family:${BRAND_FONT};text-align:${align};">
            <span class="force-brand" style="font-size:15px;font-weight:700;letter-spacing:0.02em;color:#0a0a0a;">${brandName}</span>
            <div style="margin-top:10px;${align === "center" ? "margin-left:auto;margin-right:auto;" : ""}width:48px;height:3px;background:${accentColor};line-height:3px;font-size:0;">&nbsp;</div>
          </td>
        </tr>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title></title>
<style>
  body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  body { margin: 0; padding: 0; width: 100% !important; background: ${pageBackground}; }
  img { border: 0; outline: none; text-decoration: none; max-width: 100%; height: auto; }
  a { color: ${accentColor}; }
  .email-cta { white-space: nowrap; }
  @media only screen and (max-width: 600px) {
    .email-container { width: 100% !important; border-radius: 0 !important; }
    .email-padding { padding-left: 24px !important; padding-right: 24px !important; }
  }
  [data-ogsc] .force-bg { background-color: ${pageBackground} !important; }
  [data-ogsc] .force-card { background-color: #ffffff !important; }
  [data-ogsc] .force-text, [data-ogsc] .force-text * { color: #1a1a1a !important; }
  [data-ogsc] .force-brand { color: #0a0a0a !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${pageBackground};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${pageBackground}" class="force-bg" style="background:${pageBackground};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" class="email-container force-card" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;">
        ${headerRow}
        <tr>
          <td class="email-padding force-text" style="padding:${brandingEnabled ? "20px" : "32px"} 40px 36px 40px;font-family:${bodyFont};font-size:16px;line-height:1.7;color:#1a1a1a;">
            ${bodyHtml}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
