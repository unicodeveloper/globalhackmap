import { cacheLife } from "next/cache";

import { cardBytes, pngResponse } from "@/lib/og/card";
import { fallbackCard, digestCard } from "@/lib/og/cards";
import { kevIndex } from "@/lib/og/kev";
import { buildDigest } from "@/lib/og/digest";
import { getSnapshot } from "@/lib/snapshot";

export const alt = "Global Hack Map daily brief: everything that broke in the last 48 hours, with counts, on a world map";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function render(): Promise<ArrayBuffer> {
  "use cache";
  cacheLife("feed");
  const [snapshot, kev] = await Promise.all([getSnapshot().catch(() => null), kevIndex()]);
  if (!snapshot) return cardBytes(fallbackCard("Everything that broke in the last 48 hours", "Breaches, exploited flaws and malicious packages, sourced."));
  const digest = buildDigest(snapshot, kev);
  const { counts } = digest;
  return cardBytes(
    digestCard({ date: digest.date, incidents: digest.incidents, kevAdded: counts.kevAdded, newsVulns: counts.newsVulns, malware: counts.malware }),
  );
}

export default async function Image() {
  return pngResponse(await render());
}
