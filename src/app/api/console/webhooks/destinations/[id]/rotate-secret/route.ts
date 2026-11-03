import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { generateSigningSecret } from "@/lib/webhookSigning";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const destinationId = Number(id);
  if (!Number.isInteger(destinationId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const secret = generateSigningSecret();
  const result = await pool.query(
    "UPDATE webhook_destinations SET signing_secret = $1, updated_at = now() WHERE id = $2 RETURNING id",
    [secret, destinationId]
  );
  if (result.rowCount === 0) return NextResponse.json({ error: "Destination not found." }, { status: 404 });

  // Shown once, in this response only -- never returned again.
  return NextResponse.json({ ok: true, signing_secret: secret });
}
