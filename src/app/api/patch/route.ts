import { NextResponse } from "next/server";

import { getPatchList } from "@/lib/patch";

export const maxDuration = 120;

export async function GET() {
  return NextResponse.json({ items: await getPatchList() }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
}
