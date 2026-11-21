import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escapeHtml";
import { FREE_GUIDE_CONTENT } from "@/lib/freeGuideContent";
import { SITE_URL } from "@/lib/siteMeta";
import { getFollowUpCourse } from "@/lib/followUpCourse";

/** The free guide goes out immediately, with no code to type first. The
 * download link is tracked, so opening it is what proves the inbox is real
 * and promotes the contact to a verified lead. That means the link has to
 * be the obvious thing to click, and the file must not be reachable any
 * other way from the popup. */
export async function sendGuideDocumentEmail(input: {
  email: string;
  name: string;
  token: string;
}) {
  const firstName = escapeHtml(input.name.trim().split(/\s+/)[0] || "there");
  const title = escapeHtml(FREE_GUIDE_CONTENT.title);
  const downloadUrl = `${SITE_URL}/api/guide/download?t=${encodeURIComponent(input.token)}`;

  // Only when it is actually published and buyable. A dead link in the
  // one email everybody opens is worse than no offer at all.
  const course = await getFollowUpCourse().catch(() => null);
  const courseBlock = course
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px 0;border:1px solid #e7e5e4;border-radius:12px;">
        <tr><td style="padding:20px 24px;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6d28d9;">If you want to watch me do it</p>
          <p style="margin:8px 0 0;font-size:16px;font-weight:700;color:#0a0a0a;">${escapeHtml(course.title)}${course.priceLabel ? ` &middot; ${escapeHtml(course.priceLabel)}` : ""}</p>
          ${course.subtitle ? `<p style="margin:6px 0 0;font-size:14px;line-height:1.5;color:#44403c;">${escapeHtml(course.subtitle)}</p>` : ""}
          <p style="margin:16px 0 0;"><a href="${escapeHtml(`${SITE_URL}${course.url}`)}" style="color:#6d28d9;font-weight:700;text-decoration:none;">See what is inside &rarr;</a></p>
        </td></tr>
      </table>`
    : "";

  return sendEmail({
    to: input.email,
    subject: `Your guide: ${FREE_GUIDE_CONTENT.title}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Here is the guide you asked for, <strong>${title}</strong>. It is 8 pages and you can read it in about ten minutes.</p>
      <p style="margin:26px 0;">
        <a href="${downloadUrl}" style="background:#6d28d9;color:#ffffff;padding:14px 26px;border-radius:999px;font-weight:700;text-decoration:none;display:inline-block;">Open your guide</a>
      </p>
      <p>Inside you will find:</p>
      <ul>
        <li>The three things you actually need, and what each one really costs</li>
        <li>What a server is and what an API key is, explained without jargon</li>
        <li>Every service I use and what I pay for it</li>
        <li>The exact first prompt to give your AI agent today</li>
      </ul>
      <p>Open it now while you have this email in front of you. I only send this link once, so if it gets buried you will have to ask for it again.</p>
      ${courseBlock}
      <p>Read it when you have a quiet twenty minutes. If something does not land, or you try it and hit a wall, just reply to this email and tell me what happened. I read every one.</p>
      <p>Thanks and regards,<br>Shubho<br>Indish Marketer</p>
      <p style="font-size:12px;color:#777;">Button not working? Paste this into your browser:<br>${escapeHtml(downloadUrl)}</p>
    `,
    category: "fixed",
  });
}
