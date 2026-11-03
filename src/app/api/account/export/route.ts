import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { exportOwnAccountData } from "@/lib/accountDeletion";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await exportOwnAccountData(session.userId);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="indish-marketer-data-export.json"`,
    },
  });
}
