import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  BUSINESS_CATEGORY_VALUES,
  type VoiceAgentBusinessProfile,
} from "@/lib/voiceAgentBusiness";

type ProfileRow = {
  company: string;
  role: string;
  website: string | null;
  category: string;
};

function textField(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeWebsite(value: unknown) {
  const website = textField(value, 300);
  if (!website) return "";

  const withProtocol = /^https?:\/\//i.test(website)
    ? website
    : `https://${website}`;

  try {
    const url = new URL(withProtocol);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  }

  try {
    const result = await pool.query<ProfileRow>(
      `SELECT company, role, website, category
         FROM voice_agent_business_profiles
        WHERE user_id = $1`,
      [user.userId],
    );

    const row = result.rows[0];
    const profile: VoiceAgentBusinessProfile | null = row
      ? {
          company: row.company,
          role: row.role,
          website: row.website ?? "",
          category: row.category,
        }
      : null;

    return NextResponse.json({ profile });
  } catch (err: unknown) {
    console.error("[voice-agent business-info GET]", err);
    return NextResponse.json({ error: "Could not load your details right now." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const company = textField(body?.company, 120);
  const role = textField(body?.role, 120);
  const category = textField(body?.category, 40);
  const website = normalizeWebsite(body?.website);

  if (!company || !role || !BUSINESS_CATEGORY_VALUES.has(category)) {
    return NextResponse.json(
      { error: "Company, role, and a valid category are required." },
      { status: 400 },
    );
  }

  if (website === null) {
    return NextResponse.json(
      { error: "Enter a valid website address." },
      { status: 400 },
    );
  }

  try {
    const result = await pool.query<ProfileRow>(
      `INSERT INTO voice_agent_business_profiles
         (user_id, company, role, website, category)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
         SET company = EXCLUDED.company,
             role = EXCLUDED.role,
             website = EXCLUDED.website,
             category = EXCLUDED.category,
             updated_at = NOW()
       RETURNING company, role, website, category`,
      [user.userId, company, role, website || null, category],
    );

    const row = result.rows[0];
    return NextResponse.json({
      profile: {
        company: row.company,
        role: row.role,
        website: row.website ?? "",
        category: row.category,
      } satisfies VoiceAgentBusinessProfile,
    });
  } catch (err: unknown) {
    console.error("[voice-agent business-info PUT]", err);
    return NextResponse.json({ error: "Could not save your details right now." }, { status: 500 });
  }
}
