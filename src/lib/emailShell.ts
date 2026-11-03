// The single wrapper every outgoing email passes through (applied inside
// sendEmail(), not per call site) -- turns a bare content fragment into a
// full HTML document with a real <head>. Without this, the provider sends the
// fragment as-is: no viewport meta, no dark-mode safety, no responsive
// breakpoints, which is why a fixed 600px table rendered shrunk-to-fit
// and dark-mode-inverted in the Gmail Android app.
//
// [data-ogsc]/[data-ogsb] are Gmail's own markers on elements it has
// auto-dark-mode-inverted -- targeting them is the standard, documented
// way to force colors back for an email that's meant to always be light.
import { SITE_NAME } from "@/config/brand";

const BRAND_FONT = "Helvetica, Arial, sans-serif";
const SERIF_FONT = "Georgia, 'Times New Roman', Times, serif";

export function wrapEmailHtml(bodyHtml: string, opts?: { serif?: boolean }): string {
  const bodyFont = opts?.serif ? SERIF_FONT : BRAND_FONT;
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
  body { margin: 0; padding: 0; width: 100% !important; background: #f4f1ec; }
  img { border: 0; outline: none; text-decoration: none; max-width: 100%; height: auto; }
  a { color: #dc2626; }
  .email-cta { white-space: nowrap; }
  @media only screen and (max-width: 600px) {
    .email-container { width: 100% !important; border-radius: 0 !important; }
    .email-padding { padding-left: 24px !important; padding-right: 24px !important; }
  }
  [data-ogsc] .force-bg { background-color: #f4f1ec !important; }
  [data-ogsc] .force-card { background-color: #ffffff !important; }
  [data-ogsc] .force-text, [data-ogsc] .force-text * { color: #1a1a1a !important; }
  [data-ogsc] .force-brand { color: #0a0a0a !important; }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f1ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f1ec" class="force-bg" style="background:#f4f1ec;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" class="email-container force-card" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;">
        <tr>
          <td class="email-padding" style="padding:32px 40px 4px 40px;font-family:${BRAND_FONT};">
            <span class="force-brand" style="font-size:15px;font-weight:700;letter-spacing:0.02em;color:#0a0a0a;">${SITE_NAME}</span>
            <div style="margin-top:10px;width:48px;height:3px;background:#dc2626;line-height:3px;font-size:0;">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td class="email-padding force-text" style="padding:20px 40px 36px 40px;font-family:${bodyFont};font-size:16px;line-height:1.7;color:#1a1a1a;">
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
