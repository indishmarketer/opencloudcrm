import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escapeHtml";
import { FREE_GUIDE_CONTENT } from "@/lib/freeGuideContent";
import type { GuideDocument } from "@/lib/guideDocuments";

export async function sendGuideDocumentEmail(input: {
  email: string;
  name: string;
  document: GuideDocument;
}) {
  const firstName = escapeHtml(input.name.trim().split(/\s+/)[0] || "there");
  const title = escapeHtml(FREE_GUIDE_CONTENT.title);
  const downloadUrl = escapeHtml(input.document.file_url);

  return sendEmail({
    to: input.email,
    subject: `Your guide: ${FREE_GUIDE_CONTENT.title}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Here is the guide you asked for: <strong>${title}</strong>.</p>
      <p>👉 <a href="${downloadUrl}" style="color:#1a0dab;font-weight:600;">Download your guide</a></p>
      <p>${escapeHtml(FREE_GUIDE_CONTENT.headline)}</p>
      <p>Keep this email. The link above points directly to the current guide file, so you do not need an account or a separate guide page.</p>
      <p>Give it a read when you have a quiet twenty minutes. If something does not land, or you try it and hit a wall, reply to this email and tell me what happened.</p>
      <p>Thanks and regards,<br>Shubho<br>Indish Marketer</p>
    `,
    category: "fixed",
  });
}
