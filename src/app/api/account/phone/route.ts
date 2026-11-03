import { NextResponse } from "next/server";

/** Legacy endpoint retained so old clients fail clearly. Account phone
 * changes must go through /start and /verify to prove the destination. */
export async function POST() {
  return NextResponse.json(
    { error: "Phone changes now require WhatsApp confirmation. Start verification from account settings." },
    { status: 410 },
  );
}
