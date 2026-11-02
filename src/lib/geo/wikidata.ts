import "server-only";

import { cacheLife } from "next/cache";

import { countryPoint, nearestCity, resolveCity, type GeoPoint } from "@/lib/geo";

const UA = "GlobalHackMap/1.0 (https://github.com/yorkeccak/globalhackmap; open-source cyber incident map)";

const ORG_HINT =
  /(company|corporation|bank|university|college|school|hospital|health|government|agency|ministry|council|authority|organi[sz]ation|manufacturer|retailer|airline|railway company|insurer|insurance|operator|provider|brand|chain|firm|enterprise|conglomerate|business|subsidiary|public body|municipality|city|department|police|party|foundation|association|group|holding|maker|developer|publisher|platform|service|store|restaurant)/i;

interface SearchHit {
  id: string;
  label?: string;
  description?: string;
}

async function searchEntities(name: string): Promise<SearchHit[]> {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({
    action: "wbsearchentities",
    search: name,
    language: "en",
    uselang: "en",
    type: "item",
    limit: "5",
    format: "json",
    origin: "*",
  }).toString();
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return [];
  const json = (await res.json()) as { search?: SearchHit[] };
  return json.search ?? [];
}

interface HqRow {
  item: string;
  coord?: string;
  hqLabel?: string;
  iso?: string;
  site?: string;
}

async function headquarters(ids: string[]): Promise<HqRow[]> {
  const query = `SELECT ?item ?coord ?hqLabel ?iso ?site WHERE {
  VALUES ?item { ${ids.map((id) => `wd:${id}`).join(" ")} }
  OPTIONAL { ?item wdt:P159 ?hq . OPTIONAL { ?hq wdt:P625 ?coord } }
  OPTIONAL { ?item wdt:P17 ?c . ?c wdt:P297 ?iso }
  OPTIONAL { ?item wdt:P856 ?site }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
  const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    results: { bindings: Record<string, { value: string }>[] };
  };
  return json.results.bindings.map((b) => ({
    item: b.item.value.split("/").pop() ?? "",
    coord: b.coord?.value,
    hqLabel: b.hqLabel?.value,
    iso: b.iso?.value,
    site: b.site?.value,
  }));
}

function similar(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(inc|llc|ltd|plc|corp|corporation|co|company|group|holdings|sa|ag|gmbh|kk|the)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
  const x = norm(a);
  const y = norm(b);
  return x.length > 1 && (x === y || x.startsWith(y) || y.startsWith(x));
}

function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

type Headquarters = GeoPoint & { basis: "hq" | "country"; qid: string; domain?: string };

/** Network errors propagate so they are never cached; null means Wikidata genuinely has no match. */
async function lookup(name: string, countryHint?: string): Promise<Headquarters | null> {
  const hits = (await searchEntities(name)).filter((hit) => hit.label && similar(hit.label, name) && ORG_HINT.test(hit.description ?? ""));
  if (!hits.length) return null;
  const rows = await headquarters(hits.slice(0, 3).map((hit) => hit.id));
  for (const hit of hits.slice(0, 3)) {
    const forHit = rows.filter((row) => row.item === hit.id);
    const iso = forHit.find((row) => row.iso)?.iso;
    if (countryHint && iso && iso !== countryHint) continue;
    const domain = hostOf(forHit.find((row) => row.site)?.site);
    const withCoord = forHit.find((row) => row.coord);
    if (withCoord?.coord) {
      const match = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(withCoord.coord);
      if (match) {
        const lon = Number(match[1]);
        const lat = Number(match[2]);
        // HQ labels are often buildings or districts ("AEON Tower"), so name the nearest real city.
        const named = (withCoord.hqLabel ? resolveCity(withCoord.hqLabel, iso) : undefined) ?? nearestCity(lat, lon, iso);
        if (!named?.city) continue;
        return {
          lat: named.lat,
          lon: named.lon,
          city: named.city,
          country: iso ?? countryHint ?? named.country,
          basis: "hq",
          qid: hit.id,
          domain,
        };
      }
    }
    if (iso) {
      const point = countryPoint(iso);
      if (point) return { ...point, basis: "country", qid: hit.id, domain };
    }
  }
  return null;
}

/** Shared by every instance: Wikidata is slow and rate-limited, and headquarters rarely move. */
async function cachedHeadquarters(name: string, countryHint: string): Promise<Headquarters | null> {
  "use cache: remote";
  try {
    const hq = await lookup(name, countryHint || undefined);
    cacheLife("paid");
    return hq;
  } catch {
    // Unreachable rather than unknown: try again soon.
    cacheLife("minutes");
    return null;
  }
}

/** Headquarters location for a named organisation from Wikidata (CC0), or null when unknown or unreachable. */
export function wikidataHeadquarters(name: string, countryHint?: string): Promise<Headquarters | null> {
  return cachedHeadquarters(name, countryHint ?? "");
}
