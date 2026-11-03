import { NextResponse } from "next/server";
import { PageError } from "@/lib/sitePages";

/** Who to record in site_pages.updated_by: the admin's email, or "api". */
export function actorOf(auth: { via: "session"; email: string } | { via: "token"; tokenId: number }): string {
  return auth.via === "session" ? auth.email : `api-token:${auth.tokenId}`;
}

/** PageError -> its status and message; anything else is a real 500. */
export function pageErrorResponse(error: unknown): NextResponse {
  if (error instanceof PageError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("pages API:", error);
  return NextResponse.json({ error: "Something went wrong saving the page." }, { status: 500 });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
