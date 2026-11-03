import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import {
  getWhatsAppBusinessProfile,
  listWhatsAppPhoneNumbers,
  updateWhatsAppBusinessProfile,
  uploadTemplateMediaSample,
} from "@/lib/whatsappTemplates";

/** The profile a customer sees when they tap the business name in a chat.
 *
 * It belongs to the phone number, not to the WhatsApp Business Account, so
 * a second number starts out completely blank however well filled in the
 * first one is -- which is exactly what it looks like in Meta's own
 * settings, where the second number appears to have nothing. This edits
 * either number from here instead.
 *
 * Meta's own limits, enforced before the call so a refusal explains itself:
 * about 139 characters, description 512, address 256, email 128. */
const Schema = z.object({
  about: z.string().trim().max(139),
  description: z.string().trim().max(512),
  address: z.string().trim().max(256),
  email: z.string().trim().max(128),
  website: z.string().trim().max(256),
  website2: z.string().trim().max(256),
}).partial().strict();

async function ownsNumber(id: string): Promise<boolean> {
  const numbers = await listWhatsAppPhoneNumbers();
  return numbers.some((number) => number.id === id);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    if (!(await ownsNumber(id))) {
      return NextResponse.json({ error: "That number is not on this WhatsApp account." }, { status: 404 });
    }
    return NextResponse.json({ profile: await getWhatsAppBusinessProfile(id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not reach WhatsApp." }, { status: 409 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Could not read that form." }, { status: 400 });

  const parsed = Schema.safeParse(Object.fromEntries(
    ["about", "description", "address", "email", "website", "website2"].map((key) => [key, String(form.get(key) ?? "")]),
  ));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check those details." }, { status: 400 });
  }

  const { website, website2, email, ...rest } = parsed.data;
  // Meta rejects a malformed URL with an unhelpful error, so say it plainly.
  const websites = [website, website2].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  for (const url of websites) {
    if (!/^https?:\/\/\S+\.\S+/.test(url)) {
      return NextResponse.json({ error: `"${url}" needs to start with http:// or https://.` }, { status: 400 });
    }
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That email address does not look right." }, { status: 400 });
  }

  try {
    if (!(await ownsNumber(id))) {
      return NextResponse.json({ error: "That number is not on this WhatsApp account." }, { status: 404 });
    }

    let profile_picture_handle: string | undefined;
    const picture = form.get("picture");
    if (picture instanceof File && picture.size > 0) {
      if (!["image/jpeg", "image/png"].includes(picture.type)) {
        return NextResponse.json({ error: "The picture has to be a JPEG or PNG." }, { status: 400 });
      }
      profile_picture_handle = await uploadTemplateMediaSample({
        bytes: await picture.arrayBuffer(),
        type: picture.type,
        name: picture.name || "profile.jpg",
      });
    }

    await updateWhatsAppBusinessProfile(id, {
      ...rest,
      email,
      websites,
      ...(profile_picture_handle ? { profile_picture_handle } : {}),
    });
    return NextResponse.json({ ok: true, profile: await getWhatsAppBusinessProfile(id) });
  } catch (e) {
    // 409, never 5xx: Cloudflare replaces 502/503/504 bodies with its own
    // error page and Meta's reason never reaches the browser.
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save that." }, { status: 409 });
  }
}
