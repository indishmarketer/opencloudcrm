import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import {
  ACCOUNT_PHONE_OTP_GROUP,
  deleteTemplateGroup,
  isOtpCopyCodeButton,
  listTemplateGroups,
  listWhatsAppTemplates,
  renameTemplateGroup,
  setTemplateGroup,
  templateButtons,
} from "@/lib/whatsappTemplates";

const MembershipSchema = z.object({
  action: z.literal("membership"),
  name: z.string().trim().min(1).max(512),
  group: z.string().trim().min(1).max(40),
  member: z.boolean(),
}).strict();

const RenameSchema = z.object({
  action: z.literal("rename"),
  group: z.string().trim().min(1).max(40),
  to: z.string().trim().min(1).max(40),
}).strict();

const DeleteSchema = z.object({
  action: z.literal("delete"),
  group: z.string().trim().min(1).max(40),
}).strict();

const Schema = z.discriminatedUnion("action", [MembershipSchema, RenameSchema, DeleteSchema]);

/** Our own grouping for templates, which Meta knows nothing about: its
 * categories are about billing and review, not about whether a message is
 * for bookings, courses or the newsletter. Kept in our database rather than
 * encoded into template names, because a name cannot be changed after
 * creation.
 *
 * A template can be in several groups, so this adds and removes one
 * membership at a time; renaming and deleting a group act on every template
 * in it, and deleting removes only the grouping, never the templates. */
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid group change." }, { status: 400 });

  if (parsed.data.action === "membership") {
    const membership = parsed.data;
    if (membership.group.toLowerCase() === ACCOUNT_PHONE_OTP_GROUP.toLowerCase() && membership.member) {
      const template = (await listWhatsAppTemplates()).find((item) => item.name === membership.name);
      const eligible = template?.status === "APPROVED" && template.category === "AUTHENTICATION" &&
        templateButtons(template).some(isOtpCopyCodeButton);
      if (!eligible) {
        return NextResponse.json({ error: "Select an approved Authentication template with a Copy code button." }, { status: 400 });
      }
      const groups = await listTemplateGroups();
      for (const [name, memberships] of Object.entries(groups)) {
        if (name !== membership.name && memberships.some((group) => group.toLowerCase() === ACCOUNT_PHONE_OTP_GROUP.toLowerCase())) {
          await setTemplateGroup(name, ACCOUNT_PHONE_OTP_GROUP, false);
        }
      }
    }
    await setTemplateGroup(membership.name, membership.group, membership.member);
  } else if (parsed.data.action === "rename") {
    await renameTemplateGroup(parsed.data.group, parsed.data.to);
  } else {
    await deleteTemplateGroup(parsed.data.group);
  }
  return NextResponse.json({ ok: true });
}
