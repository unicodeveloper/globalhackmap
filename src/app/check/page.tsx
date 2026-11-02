import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Suspense } from "react";

import { CheckExperience } from "@/components/check/check-experience";
import type { CheckIncident } from "@/components/check/match";
import type { Suggestion } from "@/components/check/use-check";
import { SiteBar } from "@/components/hud/latest-cves";
import { allCountries } from "@/lib/countries";
import { getSnapshot } from "@/lib/snapshot";
import { getKevCatalog } from "@/lib/sources/vulns";
import type { Incident } from "@/lib/types";

const DESCRIPTION =
  "Add the apps, products and companies you use and see what attackers are exploiting in them, which have been breached this month, and what to do. Nothing to upload.";

export const metadata: Metadata = {
  title: "Are you affected?",
  description: DESCRIPTION,
  alternates: { canonical: "/check" },
  openGraph: { title: "Are you affected? | Global Hack Map", description: DESCRIPTION, images: [{ url: "/check/og", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "Are you affected? | Global Hack Map", description: DESCRIPTION, images: ["/check/og"] },
};

const COUNTRY_NAMES = new Set(allCountries().map((country) => country.name.toLowerCase()));

/** Organisations people will recognise, taken from this month's confirmed and reported incidents. */
function suggestionsFrom(incidents: Incident[]): Suggestion[] {
  const score = (incident: Incident) =>
    incident.severity * 10 +
    (incident.status === "confirmed" ? 4 : 2) +
    Math.min(incident.sources.length, 4) * 2 +
    Math.log10((incident.records ?? 0) + 1) +
    (incident.domain ? 2 : 0);
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  const ranked = incidents
    .filter((incident) => (incident.status === "confirmed" || incident.status === "reported") && !COUNTRY_NAMES.has(incident.victim.toLowerCase()))
    .sort((a, b) => score(b) - score(a));
  for (const incident of ranked) {
    const name = incident.victim.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    if (name.length > 28 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(incident.domain ? { name, domain: incident.domain } : { name });
    if (out.length >= 10) break;
  }
  return out;
}

/** Everything the check needs from the live picture, cached so the page's shell carries the full UI. */
async function checkData() {
  "use cache";
  cacheLife("feed");
  const [snapshot, kev] = await Promise.all([getSnapshot().catch(() => null), getKevCatalog().catch(() => null)]);
  const incidents: CheckIncident[] = (snapshot?.incidents ?? []).map((incident) => ({
    id: incident.id,
    victim: incident.victim,
    domain: incident.domain,
    status: incident.status,
    type: incident.type,
    title: incident.title,
    date: incident.date,
    actor: incident.actor,
    country: incident.country,
  }));
  return {
    incidents,
    suggestions: snapshot ? suggestionsFrom(snapshot.incidents) : [],
    available: Boolean(snapshot),
    kevTotal: kev?.length ?? null,
    // Inside the cache scope, so reading the clock is safe; an epoch fallback would make every flaw look new.
    generatedAt: snapshot?.generatedAt ?? new Date().toISOString(),
  };
}

async function Check({ initialAdd }: { initialAdd?: string }) {
  return <CheckExperience {...await checkData()} initialAdd={initialAdd} />;
}

/** `?add=` (from search on the map) puts one name on the list; it is read at request time. */
async function CheckFromUrl({ searchParams }: Pick<PageProps<"/check">, "searchParams">) {
  const { add } = await searchParams;
  return <Check initialAdd={typeof add === "string" ? add.slice(0, 60) : undefined} />;
}

export default function CheckPage({ searchParams }: PageProps<"/check">) {
  return (
    <div className="min-h-dvh bg-space">
      <div className="relative z-10">
        <SiteBar />
      </div>
      {/* The static shell already holds the full check; a name from the URL is added once it streams in. */}
      <Suspense fallback={<Check />}>
        <CheckFromUrl searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
