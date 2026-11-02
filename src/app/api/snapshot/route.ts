import { NextResponse } from "next/server";

import { getSnapshot } from "@/lib/snapshot";

/** The full public snapshot for agents and scripts (llms.txt and /agents point here). */
export async function GET() {
  const snapshot = await getSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      // Public, read-only data: browser-based agents on other origins may read it too.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
