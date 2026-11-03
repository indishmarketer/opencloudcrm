/** Escapes user-provided text before interpolating it into an HTML email
 * body. Every sendEmail() call site that embeds a user-submitted string
 * (name, message, role, etc.) via a template literal needs this -- without
 * it, a value like `<img src=x onerror=...>` renders as live HTML in the
 * recipient's email client. */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
