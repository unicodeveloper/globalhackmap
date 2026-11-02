import { Suspense } from "react";

import { CveTicker, type TickerVuln } from "@/components/hud/cve-ticker";
import { TopBar } from "@/components/hud/top-bar";
import { getSnapshot } from "@/lib/snapshot";

/** The new-CVE banner on pages outside the live map, read from the shared cached snapshot. */
async function LatestCves() {
  const { fresh, generatedAt } = await getSnapshot();
  // Only what the ticker draws, so every page carries a few kilobytes rather than full advisories.
  const items: TickerVuln[] = fresh.map(({ cve, vendor, product, cvss, kev, ransomware, kevAdded, published }) => ({
    cve,
    vendor,
    product,
    cvss,
    kev,
    ransomware,
    kevAdded,
    published,
  }));
  return <CveTicker items={items} generatedAt={generatedAt} />;
}

/** The site bar for every page outside the situation room, with the new-CVE banner. */
export function SiteBar() {
  return (
    <TopBar
      ticker={
        <Suspense fallback={null}>
          <LatestCves />
        </Suspense>
      }
    />
  );
}
