import { cacheLife } from "next/cache";

import { countryName } from "@/lib/countries";
import { cardBytes, pngResponse } from "@/lib/og/card";
import { countryCard, fallbackCard } from "@/lib/og/cards";
import { countryIncidents } from "@/lib/og/select";
import { getSnapshot } from "@/lib/snapshot";
import { countryParams } from "@/lib/static-params";

export const alt = "Global Hack Map country card: organisations hit by cyber attacks in this country in the last 30 days, on a map";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  return countryParams();
}

async function render(iso: string): Promise<ArrayBuffer> {
  "use cache";
  cacheLife("feed");
  const snapshot = await getSnapshot().catch(() => null);
  if (!/^[A-Z]{2}$/.test(iso) || countryName(iso) === iso || !snapshot) {
    return cardBytes(fallbackCard("Every hack, exploit and breach, live", "Every breach, ransomware attack and exploited flaw, sourced."));
  }
  return cardBytes(countryCard(iso, countryIncidents(snapshot, iso)));
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  return pngResponse(await render((await params).code.toUpperCase()));
}
