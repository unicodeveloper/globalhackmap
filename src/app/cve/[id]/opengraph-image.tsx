import { cacheLife } from "next/cache";

import { findVuln } from "@/lib/lookup";
import { cardBytes, pngResponse } from "@/lib/og/card";
import { cveCard, fallbackCard } from "@/lib/og/cards";
import { kevIndex, withKev } from "@/lib/og/kev";
import { cveMentions } from "@/lib/og/select";
import { getSnapshot } from "@/lib/snapshot";
import { getEpss } from "@/lib/sources/vulns";
import { cveParams } from "@/lib/static-params";
import { decodeParam } from "@/lib/utils";

export const alt = "Global Hack Map vulnerability card: whether it is exploited in the wild, the chance of exploitation and its severity";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  return cveParams();
}

async function render(cve: string): Promise<ArrayBuffer> {
  "use cache";
  cacheLife("feed");
  const [found, snapshot, kev] = await Promise.all([findVuln(cve).catch(() => null), getSnapshot().catch(() => null), kevIndex()]);
  if (!found) return cardBytes(fallbackCard(`${cve} not found`, "Check the ID, or search every exploited flaw on the live map."));
  let vuln = withKev(found, kev);
  if (vuln.epss === undefined) {
    const score = (await getEpss([vuln.cve]).catch(() => null))?.get(vuln.cve);
    if (score) vuln = { ...vuln, epss: score.epss, epssPercentile: score.percentile };
  }
  return cardBytes(cveCard(vuln, snapshot ? cveMentions(snapshot, vuln.cve) : [], kev !== null));
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  return pngResponse(await render(decodeParam((await params).id).toUpperCase()));
}
