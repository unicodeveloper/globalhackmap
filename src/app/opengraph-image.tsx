import { cacheLife } from "next/cache";

import { cardBytes, pngResponse } from "@/lib/og/card";
import { fallbackCard, homeCard } from "@/lib/og/cards";
import { withinDays } from "@/lib/og/select";
import { getSnapshot } from "@/lib/snapshot";

export const alt = "Global Hack Map: every organisation hit by a cyber attack in the last 7 days, on a world map";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function render(): Promise<ArrayBuffer> {
  "use cache";
  cacheLife("feed");
  const snapshot = await getSnapshot().catch(() => null);
  if (!snapshot) return cardBytes(fallbackCard("Every hack, exploit and breach, live", "Every breach, ransomware attack and exploited flaw, sourced."));
  return cardBytes(homeCard(withinDays(snapshot.incidents, 7)));
}

export default async function Image() {
  return pngResponse(await render());
}
