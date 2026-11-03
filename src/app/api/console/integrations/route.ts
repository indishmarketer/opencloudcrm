import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(
    "SELECT id, name, type, config, created_at FROM integrations ORDER BY created_at DESC"
  );

  // API keys are real secrets -- never send the plaintext value back to the
  // browser once stored, only enough to recognize which one it is.
  const integrations = result.rows.map((row) => {
    if (row.type === "api_key" && typeof row.config?.value === "string") {
      const value: string = row.config.value;
      const masked = value.length > 4 ? `${"•".repeat(Math.max(value.length - 4, 4))}${value.slice(-4)}` : "••••";
      return { ...row, config: { ...row.config, value: masked } };
    }
    return row;
  });

  return NextResponse.json({ integrations });
}

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, type, config } = await req.json();
  if (!name || !type) {
    return NextResponse.json({ error: "Name and type are required." }, { status: 400 });
  }
  if (type === "webhook_url") {
    return NextResponse.json(
      { error: "Outbound webhook URLs are now managed on the Outbound webhooks page, not here." },
      { status: 400 }
    );
  }

  const result = await pool.query(
    "INSERT INTO integrations (name, type, config) VALUES ($1, $2, $3) RETURNING id",
    [name.slice(0, 200), type.slice(0, 100), JSON.stringify(config || {})]
  );
  return NextResponse.json({ ok: true, id: result.rows[0].id });
}
