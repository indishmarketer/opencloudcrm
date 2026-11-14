// The single wrapper every outgoing email passes through (applied inside
// sendEmail(), not per call site) -- turns a bare content fragment into a
// full HTML document with a real <head>. Without this, the provider sends the
// fragment as-is: no viewport meta, no dark-mode safety, no responsive
// breakpoints, which is why a fixed 600px table rendered shrunk-to-fit
// and dark-mode-inverted in the Gmail Android app. This is purely
// technical plumbing -- no header, no branding, no forced card/background.
// The email body is whatever the composer wrote, full stop.
//
// [data-ogsc]/[data-ogsb] are Gmail's own markers on elements it has
// auto-dark-mode-inverted -- targeting them is the standard, documented
// way to force colors back for an email that's meant to always be light.
export function wrapEmailHtml(bodyHtml: string): string {
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
  body { margin: 0; padding: 0; width: 100% !important; background: #ffffff; }
  img { border: 0; outline: none; text-decoration: none; max-width: 100%; height: auto; }
  @media only screen and (max-width: 600px) {
    .email-container { width: 100% !important; }
  }
  [data-ogsc] .force-text, [data-ogsc] .force-text * { color: #1a1a1a !important; }
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
  <tr>
    <td class="email-container force-text" style="padding:24px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;">
      ${bodyHtml}
    </td>
  </tr>
</table>
</body>
</html>`;
}
