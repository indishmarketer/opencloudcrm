import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import {
  ACCOUNT_PHONE_OTP_GROUP,
  isOtpCopyCodeButton,
  listTemplateGroups,
  listWhatsAppTemplates,
  setTemplateGroup,
  templateButtons,
} from "@/lib/whatsappTemplates";

const Schema = z.object({ name: z.string().trim().min(1).max(512) }).strict();

/** Marks one approved Authentication / Copy code template as the account
 * phone verification template by using the console's existing template
 * group feature. */
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose an Authentication template." }, { status: 400 });

  try {
    const templates = await listWhatsAppTemplates();
    const template = templates.find((item) => item.name === parsed.data.name && item.status === "APPROVED");
    const hasCopyCode = template ? templateButtons(template).some(isOtpCopyCodeButton) : false;
    if (!template || template.category !== "AUTHENTICATION" || !hasCopyCode) {
      return NextResponse.json(
        { error: "Only an approved Authentication template with a Copy code button can verify account numbers." },
        { status: 400 },
      );
    }

    const groups = await listTemplateGroups();
    for (const [name, memberships] of Object.entries(groups)) {
      if (name !== template.name && memberships.some((group) => group.toLowerCase() === ACCOUNT_PHONE_OTP_GROUP.toLowerCase())) {
        await setTemplateGroup(name, ACCOUNT_PHONE_OTP_GROUP, false);
      }
    }
    await setTemplateGroup(template.name, ACCOUNT_PHONE_OTP_GROUP, true);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Could not select account phone verification template:", error);
    return NextResponse.json({ error: "Could not save that template selection." }, { status: 409 });
  }
}
