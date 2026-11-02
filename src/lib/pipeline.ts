import "server-only";

import { countryCode, countryFromDomain, countryPoint, isDatelineOnly, jitter, resolveCity, resolveUsLocation, type GeoPoint } from "@/lib/geo";
import { wikidataHeadquarters } from "@/lib/geo/wikidata";
import type { Candidate } from "@/lib/sources/incidents";
import type { GeoBasis, Incident, IncidentStatus, SourceRef } from "@/lib/types";

const STATUS_RANK: Record<IncidentStatus, number> = {
  confirmed: 5,
  disputed: 4,
  reported: 3,
  precautionary: 2,
  claimed: 1,
};

const BASIS_RANK: Record<GeoBasis, number> = { stated: 4, hq: 3, tld: 2, country: 1 };

const CRITICAL_SECTORS =
  /(health|hospital|medical|government|public|energy|utility|telecom|finance|bank|insur|transport|rail|aviation|airport|defen[cs]e|water|education|school|university)/i;

interface Located extends Candidate {
  geo: GeoPoint & { basis: GeoBasis };
  notable: boolean;
}

export function victimKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\.(com|net|org|co|io)(\.[a-z]{2})?$/, "")
    .replace(/\b(inc|incorporated|llc|ltd|limited|plc|corp|corporation|co|company|group|holdings?|sa|ag|gmbh|kk|s\.?a\.?|pty|nv|bv|spa|srl)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** "Quest Diagnostics Inc" -> "Quest Diagnostics". */
function displayName(name: string): string {
  return name.replace(/,?\s+(inc|incorporated|corp|corporation|co|ltd|limited|plc|llc)\.?$/i, "").trim() || name;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Resolve where a candidate should sit on the map. Never at a street address: city centroid at best. */
async function locate(input: Candidate, budget: { remaining: number; until: number }): Promise<Located | null> {
  let candidate = input;
  const country = countryCode(candidate.country) ?? countryFromDomain(candidate.domain);
  let geo: (GeoPoint & { basis: GeoBasis }) | undefined;
  let notable = false;

  if (candidate.usLocation) {
    const point = resolveUsLocation(candidate.usLocation);
    if (point) geo = { ...point, basis: point.city ? "hq" : "country" };
  }

  if (!geo && candidate.city && !isDatelineOnly(candidate.city, candidate.text)) {
    const point = resolveCity(candidate.city, country);
    if (point) geo = { ...point, basis: candidate.cityStated === false ? "hq" : "stated" };
  }

  if ((!geo || geo.basis === "country") && budget.remaining > 0 && Date.now() < budget.until && candidate.victim.length > 3) {
    budget.remaining -= 1;
    const hq = await wikidataHeadquarters(candidate.victim, country);
    if (hq) {
      notable = true;
      if (!candidate.domain && hq.domain) candidate = { ...candidate, domain: hq.domain };
      if (hq.basis === "hq" && (!country || hq.country === country)) {
        geo = { lat: hq.lat, lon: hq.lon, city: hq.city, country: hq.country || country || "", basis: "hq" };
      }
    }
  }

  if (!geo) {
    const tldCountry = countryFromDomain(candidate.domain);
    const iso = country ?? tldCountry;
    const point = iso ? countryPoint(iso) : undefined;
    if (point) geo = { ...point, basis: tldCountry && !candidate.country ? "tld" : "country" };
  }

  if (!geo) return null;
  return { ...candidate, geo, notable };
}

function sourceStrength(source: SourceRef, status: IncidentStatus): number {
  switch (source.kind) {
    case "filing":
    case "regulator":
      return 0.6;
    case "victim":
      return 0.55;
    case "leaksite":
      return 0.15;
    default:
      return status === "confirmed" ? 0.5 : 0.4;
  }
}

function severityOf(incident: Omit<Incident, "severity" | "confidence">, notable: boolean): Incident["severity"] {
  let score = 1;
  const people = Math.max(incident.records ?? 0, (incident.recordsClaimed ?? 0) * 0.5);
  if (people >= 10_000_000) score += 3;
  else if (people >= 1_000_000) score += 2;
  else if (people >= 100_000) score += 1;
  if (["ransomware", "supply_chain"].includes(incident.type)) score += 1;
  if (incident.sector && CRITICAL_SECTORS.test(incident.sector)) score += 1;
  if (notable) score += 1;
  if (incident.status === "claimed") score -= 1;
  return Math.max(1, Math.min(4, score)) as Incident["severity"];
}

function keysOf(item: Candidate): string[] {
  const keys = [victimKey(item.victim)];
  if (item.domain) keys.push(victimKey(item.domain));
  return keys.filter((key) => key.length > 1);
}

/** Same victim if a name or domain key matches, or one name extends the other ("quest" and "questdiagnostics"). */
function sameVictim(a: Candidate, b: Candidate): boolean {
  const ka = keysOf(a);
  const kb = keysOf(b);
  for (const x of ka) {
    for (const y of kb) {
      if (x === y) return true;
      const [short, long] = x.length < y.length ? [x, y] : [y, x];
      if (short.length >= 5 && long.startsWith(short)) return true;
    }
  }
  return false;
}

/** Union-find over candidates: same victim within a 14-day window. */
function clusterLocated(items: Located[]): Located[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (Math.abs(Date.parse(items[i].date) - Date.parse(items[j].date)) > 14 * 86_400_000) continue;
      if (sameVictim(items[i], items[j])) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Located[]>();
  items.forEach((item, i) => {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(item);
    groups.set(root, list);
  });
  return [...groups.values()];
}

/** Merge candidates about the same victim within a 14-day window into incidents. */
export async function buildIncidents(candidates: Candidate[], options: { wikidataBudget?: number; wikidataMs?: number } = {}): Promise<Incident[]> {
  // Lookups are cached per name, so a refresh mostly hits the cache; the time cap bounds a cold start,
  // which places the rest at country level until the next refresh resolves them.
  const budget = { remaining: options.wikidataBudget ?? 60, until: Date.now() + (options.wikidataMs ?? 10_000) };
  // Strongest evidence first, so the Wikidata budget goes to confirmed reports.
  const ordered = [...candidates].sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status] || b.date.localeCompare(a.date));
  const located: Located[] = [];
  for (let i = 0; i < ordered.length; i += 25) {
    const slice = ordered.slice(i, i + 25);
    const results = await Promise.all(slice.map((candidate) => locate(candidate, budget).catch(() => null)));
    for (const result of results) if (result) located.push(result);
  }

  const groups = clusterLocated(located);

  const incidents: Incident[] = [];
  for (const group of groups) {
    const byStatus = [...group].sort(
      (a, b) =>
        STATUS_RANK[b.status] - STATUS_RANK[a.status] || Number(b.origin !== "claims") - Number(a.origin !== "claims") || b.summary.length - a.summary.length,
    );
    // Status comes from the strongest evidence; the words come from the best news write-up.
    const status = byStatus[0].status;
    const writer = byStatus.find((item) => item.origin === "news" || item.origin === "sweep") ?? byStatus[0];
    const lead = { ...writer, victim: displayName(byStatus.find((item) => item.origin === "sec")?.victim ?? writer.victim) };
    const best = [...group].sort(
      (a, b) =>
        BASIS_RANK[b.geo.basis] - BASIS_RANK[a.geo.basis] ||
        Number(b.origin === "sec") - Number(a.origin === "sec") ||
        STATUS_RANK[b.status] - STATUS_RANK[a.status],
    )[0];
    const sources = new Map<string, SourceRef>();
    for (const item of group) for (const source of item.sources) if (!sources.has(source.url)) sources.set(source.url, source);
    const sourceList = [...sources.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const publishers = new Set(sourceList.map((s) => s.publisher).filter(Boolean));
    const dates = group.map((item) => item.date).sort();
    const records = Math.max(0, ...group.map((item) => item.records ?? 0)) || undefined;
    const recordsClaimed = Math.max(0, ...group.map((item) => item.recordsClaimed ?? 0)) || undefined;
    const notable = group.some((item) => item.notable);
    const id = `${slugify(lead.victim)}-${dates[0].slice(0, 7)}`;
    const [lat, lon] = jitter(id, best.geo.lat, best.geo.lon, best.geo.basis === "country" || best.geo.basis === "tld" ? 1.2 : 0.06);

    const base = {
      id,
      victim: lead.victim,
      domain: group.find((item) => item.domain)?.domain,
      sector: group.find((item) => item.sector && item.sector !== "other")?.sector,
      type: lead.type,
      status,
      title: lead.headline,
      summary: lead.summary.slice(0, 480),
      actor: group.find((item) => item.actor)?.actor,
      records,
      recordsClaimed,
      cves: [...new Set(group.flatMap((item) => item.cves))].slice(0, 8),
      country: best.geo.country,
      city: best.geo.basis === "stated" || best.geo.basis === "hq" ? best.geo.city : undefined,
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      geoBasis: best.geo.basis,
      date: dates[0],
      updated: dates[dates.length - 1],
      sources: sourceList.slice(0, 6),
      origin: lead.origin,
    } satisfies Omit<Incident, "severity" | "confidence">;

    const strength = Math.max(...sourceList.map((source) => sourceStrength(source, status)));
    const corroboration = publishers.size >= 3 ? 0.2 : publishers.size === 2 ? 0.1 : 0;
    const precision = { stated: 0.2, hq: 0.15, tld: 0.08, country: 0.05 }[best.geo.basis];
    incidents.push({
      ...base,
      severity: severityOf(base, notable),
      confidence: Number(Math.min(1, strength + corroboration + precision).toFixed(2)),
    });
  }

  return incidents.sort((a, b) => b.date.localeCompare(a.date));
}
