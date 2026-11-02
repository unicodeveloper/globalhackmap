import { NextResponse } from "next/server";

import { isCveId } from "@/lib/lookup";
import { explainCve } from "@/lib/patch";
import { getSnapshot } from "@/lib/snapshot";

export const maxDuration = 60;

/**
 * Plain-English explainer for a CVE on the live board. Limited to CVEs in the current snapshot so
 * the shared key only ever pays for a bounded, cached set.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ cve: string }> }) {
  const cve = (await params).cve.toUpperCase();
  if (!isCveId(cve)) return NextResponse.json({ error: "Not a CVE ID" }, { status: 400 });
  const snapshot = await getSnapshot();
  const vuln = [...snapshot.kev, ...snapshot.trending].find((item) => item.cve === cve);
  if (!vuln?.vendor) return NextResponse.json({ error: "Not on the live board" }, { status: 404 });
  const explainer = await explainCve(vuln.cve);
  if (!explainer) return NextResponse.json({ error: "No explainer yet" }, { status: 503 });
  return NextResponse.json(explainer, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
