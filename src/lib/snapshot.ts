import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import seed from "@/data/seed-snapshot.json";
import { beforeDeadline } from "@/lib/fetched";
import { buildIncidents } from "@/lib/pipeline";
import { getLatestBrief, getOutages } from "@/lib/sources/context";
import { getNewsIncidents, getRansomwareClaims, getSecDisclosures, getSweepIncidents, type Candidate } from "@/lib/sources/incidents";
import {
  getCriticalAdvisories,
  getCveNewsMentions,
  getCveRecord,
  getEpss,
  getKevCatalog,
  getLatestCriticalCves,
  getMalwarePackages,
  getRecentCriticalCves,
} from "@/lib/sources/vulns";
import type { Incident, Snapshot, Vuln } from "@/lib/types";

const DAY = 86_400_000;

// The dev server aborts a cache fill that stays silent for 10s, so a cold dev build trades
// completeness for speed. Production gets the full budgets inside the 50s fill limit.
const DEV = process.env.NODE_ENV === "development";
const NEWS_BUDGET_MS = DEV ? 4_000 : 18_000;
const WIKIDATA_MS = DEV ? 1_500 : 10_000;

// One slow upstream must not hold the whole picture past the cache-fill limit (50s, or the dev server's
// 10s quiet-fill probe); the feed reports as timed out and its own cache fills for the next refresh.
const FEED_CEILING_MS = DEV ? 8_000 : 25_000;
const TIMED_OUT = Symbol("timed out");

async function settle<T>(feeds: Snapshot["feeds"], name: string, task: () => Promise<T>, fallback: T, count: (value: T) => number): Promise<T> {
  try {
    const value = await beforeDeadline(task(), FEED_CEILING_MS, TIMED_OUT);
    if (value === TIMED_OUT) {
      feeds[name] = { ok: false, count: 0, note: `timed out after ${FEED_CEILING_MS / 1000}s` };
      return fallback;
    }
    feeds[name] = { ok: true, count: count(value) };
    return value;
  } catch (error) {
    feeds[name] = { ok: false, count: 0, note: error instanceof Error ? error.message.slice(0, 120) : "failed" };
    return fallback;
  }
}

function mergeVulns(lists: Vuln[][]): Vuln[] {
  const map = new Map<string, Vuln>();
  for (const list of lists) {
    for (const vuln of list) {
      const prev = map.get(vuln.cve);
      if (!prev) {
        map.set(vuln.cve, { ...vuln });
        continue;
      }
      map.set(vuln.cve, {
        ...prev,
        vendor: prev.vendor || vuln.vendor,
        product: prev.product || vuln.product,
        description: prev.description.length >= vuln.description.length ? prev.description : vuln.description,
        cvss: prev.cvss ?? vuln.cvss,
        severity: prev.severity ?? vuln.severity,
        published: prev.published ?? vuln.published,
        references: [...new Set([...prev.references, ...vuln.references])].slice(0, 6),
        newsCount: (prev.newsCount ?? 0) + (vuln.newsCount ?? 0) || undefined,
      });
    }
  }
  return [...map.values()];
}

async function buildSnapshot(): Promise<Snapshot> {
  const feeds: Snapshot["feeds"] = {};
  const now = Date.now();
  const len = (value: unknown[]) => value.length;

  const [kevAll, nvdCritical, cveListCritical, ghsaCritical, malware, claims, sec, news, sweeps, outages, brief, cveNews] = await Promise.all([
    settle(feeds, "CISA KEV", getKevCatalog, [] as Vuln[], len),
    settle(feeds, "NVD", () => getRecentCriticalCves(3), [] as Vuln[], len),
    settle(feeds, "CVE list", getLatestCriticalCves, [] as Vuln[], len),
    settle(feeds, "GitHub advisories", getCriticalAdvisories, [] as Vuln[], len),
    settle(feeds, "GitHub malware", getMalwarePackages, [], len),
    settle(feeds, "Leak-site claims", getRansomwareClaims, [] as Candidate[], len),
    settle(feeds, "SEC 8-K", getSecDisclosures, [] as Candidate[], len),
    // The extraction budget keeps a cold build inside the prerender limit for a cache fill; each
    // refresh extracts the next articles, since finished ones come back from the cache.
    settle(feeds, "Valyu news", () => getNewsIncidents(200, NEWS_BUDGET_MS), [] as Candidate[], len),
    settle(feeds, "Valyu sweeps", getSweepIncidents, [] as Candidate[], len),
    settle(feeds, "IODA outages", getOutages, [], len),
    settle(feeds, "Daily brief", getLatestBrief, null, (b) => (b ? b.items.length : 0)),
    settle(feeds, "Valyu CVE news", getCveNewsMentions, {} as Record<string, number>, (m) => Object.keys(m).length),
  ]);

  const live = await buildIncidents([...news, ...sweeps, ...sec, ...claims], { wikidataMs: WIKIDATA_MS });
  const liveIds = new Set(live.map((incident) => incident.id));
  const seedIncidents = (seed.incidents as Incident[]).filter((incident) => !liveIds.has(incident.id) && now - Date.parse(incident.date) < 30 * DAY);
  const incidents = [...live, ...seedIncidents]
    .filter((incident) => now - Date.parse(incident.date) < 30 * DAY)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 450);

  const kevIds = new Set(kevAll.map((vuln) => vuln.cve));
  const kevRecent = kevAll.slice(0, 40);

  // CVEs named in news articles and incidents count as "in the news".
  const mentions = new Map<string, number>(Object.entries(cveNews));
  for (const incident of incidents) for (const cve of incident.cves) mentions.set(cve, (mentions.get(cve) ?? 0) + 1);
  const known = new Map([...nvdCritical, ...cveListCritical, ...ghsaCritical].map((vuln) => [vuln.cve, vuln]));
  const topMentioned = [...mentions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  const mentioned: Vuln[] = await Promise.all(
    topMentioned.map(async ([cve, count]) => {
      const kev = kevAll.find((vuln) => vuln.cve === cve);
      if (kev) return { ...kev, newsCount: count };
      if (known.has(cve)) return { ...known.get(cve)!, newsCount: count };
      const record = await getCveRecord(cve).catch(() => null);
      return record
        ? { ...record, newsCount: count }
        : { cve, vendor: "", product: "", name: cve, description: "", kev: false, ransomware: false, references: [], newsCount: count };
    }),
  );

  const trendingRaw = mergeVulns([mentioned, nvdCritical, cveListCritical, ghsaCritical]).map((vuln) => {
    const kev = kevAll.find((entry) => entry.cve === vuln.cve);
    return kev
      ? {
          ...vuln,
          kev: true,
          kevAdded: kev.kevAdded,
          kevDue: kev.kevDue,
          ransomware: kev.ransomware,
          vendor: vuln.vendor || kev.vendor,
          product: vuln.product || kev.product,
        }
      : vuln;
  });

  const epss = await getEpss([...kevRecent, ...trendingRaw].map((vuln) => vuln.cve));
  const withEpss = (vuln: Vuln): Vuln => {
    const score = epss.get(vuln.cve);
    return score ? { ...vuln, epss: score.epss, epssPercentile: score.percentile } : vuln;
  };

  // Rank: in the news first, then exploitation likelihood, then severity. Unnamed router firmware noise sinks.
  const rank = (vuln: Vuln) =>
    (vuln.newsCount ?? 0) * 10 + (vuln.kev ? 8 : 0) + (vuln.epss ?? 0) * 20 + (vuln.cvss ?? 0) / 2 + (vuln.vendor || vuln.product ? 1 : -3);
  const trending = trendingRaw
    .map(withEpss)
    .sort((a, b) => rank(b) - rank(a) || (b.published ?? "").localeCompare(a.published ?? ""))
    .slice(0, 60);

  const recent = (iso: string | undefined, days: number) => Boolean(iso) && now - Date.parse(iso!) < days * DAY;
  const kev = kevRecent.map(withEpss);
  const kevDate = (vuln: Vuln) => (vuln.kevAdded ? `${vuln.kevAdded}T00:00:00Z` : undefined);
  const freshAt = (vuln: Vuln) => (recent(kevDate(vuln), 7) ? kevDate(vuln)! : (vuln.published ?? ""));
  const fresh = mergeVulns([
    kev.filter((vuln) => recent(kevDate(vuln), 7)),
    trendingRaw.filter((vuln) => vuln.severity === "CRITICAL" && recent(vuln.published, 3)).map(withEpss),
  ])
    .sort((a, b) => freshAt(b).localeCompare(freshAt(a)))
    .slice(0, 40);
  const last7 = incidents.filter((incident) => recent(incident.date, 7));

  return {
    generatedAt: new Date(now).toISOString(),
    incidents,
    kev,
    trending,
    fresh,
    malware: malware.slice(0, 40),
    outages,
    brief: brief ?? (seed.brief as unknown as Snapshot["brief"] | null) ?? undefined,
    stats: {
      incidents24h: incidents.filter((incident) => recent(incident.date, 1)).length,
      incidents7d: last7.length,
      confirmed7d: last7.filter((incident) => incident.status === "confirmed").length,
      claimed7d: last7.filter((incident) => incident.status === "claimed").length,
      countries7d: new Set(last7.map((incident) => incident.country)).size,
      kevAdded30d: kevAll.filter((vuln) => recent(kevDate(vuln), 30)).length,
      criticalCves72h: trendingRaw.filter((vuln) => vuln.severity === "CRITICAL" && recent(vuln.published, 3) && !kevIds.has(vuln.cve)).length,
      malware72h: malware.filter((item) => recent(item.published, 3)).length,
      outagesActive: outages.filter((outage) => !outage.end).length,
    },
    feeds,
  };
}

/**
 * The whole situation picture, refreshed every 10 minutes. Remote, so every server instance and route
 * shares one entry: a cold instance answering an agent's MCP call reads it instead of rebuilding the
 * pipeline. Inner per-item caches (extractions, sweeps, lookups) are reused when it rebuilds.
 */
export async function getSnapshot(): Promise<Snapshot> {
  "use cache: remote";
  cacheTag("snapshot");
  const snapshot = await buildSnapshot();
  // A picture built while several upstreams were down is kept for minutes, not the full refresh, so a
  // bad moment upstream does not pin a near-empty map for every visitor.
  const down = Object.values(snapshot.feeds).filter((feed) => !feed.ok).length;
  if (down >= 3) cacheLife("minutes");
  else cacheLife("snapshot");
  return snapshot;
}

/**
 * What the situation room renders, and so what the home page serialises into its HTML. An allowlist:
 * new Snapshot fields stay on the server until a client component needs them. The daily brief (about
 * a tenth of the payload) has its own page.
 */
export type ClientSnapshot = Pick<Snapshot, "generatedAt" | "incidents" | "kev" | "trending" | "fresh" | "malware" | "outages" | "stats" | "feeds">;

export function toClientSnapshot(snapshot: Snapshot): ClientSnapshot {
  const { generatedAt, incidents, kev, trending, fresh, malware, outages, stats, feeds } = snapshot;
  return { generatedAt, incidents, kev, trending, fresh, malware, outages, stats, feeds };
}

/** Full KEV catalogue for lookups (CVE pages, stack checks). */
export { getKevCatalog };
