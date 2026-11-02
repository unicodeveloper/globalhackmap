import "server-only";

import { type Fetched, settle, unwrap } from "@/lib/fetched";

import { cacheLife } from "next/cache";

import type { MalwarePackage, Vuln } from "@/lib/types";
import { withLastGood } from "@/lib/sources/last-good";
import { valyuServer } from "@/lib/valyu/server";

const UA = "GlobalHackMap/1.0 (+https://github.com/yorkeccak/globalhackmap)";

interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
  knownRansomwareCampaignUse: string;
  notes: string;
  cwes?: string[];
}

function kevToVuln(entry: KevEntry): Vuln {
  return {
    cve: entry.cveID,
    vendor: entry.vendorProject,
    product: entry.product,
    name: entry.vulnerabilityName,
    description: entry.shortDescription,
    kev: true,
    kevAdded: entry.dateAdded,
    kevDue: entry.dueDate,
    ransomware: entry.knownRansomwareCampaignUse === "Known",
    // Notes read "CISA Mitigation Instructions: https://...; https://vendor/advisory", so take every URL, not
    // only notes that start with one: the mitigation link is the one defenders most need.
    references: [...new Set(entry.notes.match(/https?:\/\/[^\s;,]+/g) ?? [])].slice(0, 6),
    cwe: entry.cwes?.[0],
  };
}

/** The full CISA KEV catalogue (CC0), compacted. Refreshed hourly. */
export async function getKevCatalog(): Promise<Vuln[]> {
  return unwrap(await getKevCatalogFetched());
}

async function getKevCatalogFetched(): Promise<Fetched<Vuln[]>> {
  "use cache";
  const result = await settle(async () => {
    return withLastGood("kev", async () => {
      const res = await fetch("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`KEV ${res.status}`);
      const json = (await res.json()) as { vulnerabilities: KevEntry[] };
      return json.vulnerabilities.map(kevToVuln).sort((a, b) => (b.kevAdded ?? "").localeCompare(a.kevAdded ?? ""));
    });
  });
  if (result.ok) cacheLife("hours");
  else cacheLife("minutes");
  return result;
}

interface EpssRow {
  cve: string;
  epss: string;
  percentile: string;
}

/** FIRST EPSS scores for a list of CVEs, batched. */
export async function getEpss(cves: string[]): Promise<Map<string, { epss: number; percentile: number }>> {
  const out = new Map<string, { epss: number; percentile: number }>();
  const unique = [...new Set(cves.filter((cve) => /^CVE-\d{4}-\d+$/.test(cve)))];
  for (let i = 0; i < unique.length; i += 80) {
    const batch = unique.slice(i, i + 80);
    try {
      const res = await fetch(`https://api.first.org/data/v1/epss?cve=${batch.join(",")}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { data: EpssRow[] };
      for (const row of json.data) {
        out.set(row.cve, { epss: Number(row.epss), percentile: Number(row.percentile) });
      }
    } catch {
      // EPSS is enrichment only; a failed batch leaves scores blank.
    }
  }
  return out;
}

interface NvdCve {
  cve: {
    id: string;
    published: string;
    vulnStatus: string;
    descriptions: { lang: string; value: string }[];
    metrics?: Record<string, { cvssData: { baseScore: number; baseSeverity?: string } }[]>;
    weaknesses?: { description: { value: string }[] }[];
    references?: { url: string }[];
    configurations?: { nodes: { cpeMatch: { criteria: string }[] }[] }[];
  };
}

function nvdScore(item: NvdCve["cve"]): { score?: number; severity?: Vuln["severity"] } {
  for (const key of ["cvssMetricV40", "cvssMetricV31", "cvssMetricV30"]) {
    const metric = item.metrics?.[key]?.[0]?.cvssData;
    if (metric) {
      const severity = (metric.baseSeverity ?? "").toUpperCase();
      return {
        score: metric.baseScore,
        severity: ["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(severity) ? (severity as Vuln["severity"]) : undefined,
      };
    }
  }
  return {};
}

function vendorProductFromCpe(item: NvdCve["cve"]): { vendor: string; product: string } {
  const cpe = item.configurations?.[0]?.nodes?.[0]?.cpeMatch?.[0]?.criteria;
  if (cpe) {
    const parts = cpe.split(":");
    const titled = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { vendor: titled(parts[3] ?? ""), product: titled(parts[4] ?? "") };
  }
  return { vendor: "", product: "" };
}

function isoNoZone(date: Date): string {
  return date.toISOString().replace("Z", "");
}

/** Critical CVEs NVD published in the last few days (CVSS from NVD or the CNA). */
export async function getRecentCriticalCves(days: number = 3): Promise<Vuln[]> {
  return unwrap(await getRecentCriticalCvesFetched(days));
}

async function getRecentCriticalCvesFetched(days: number = 3): Promise<Fetched<Vuln[]>> {
  "use cache";
  const result = await settle(async () => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    const url = new URL("https://services.nvd.nist.gov/rest/json/cves/2.0");
    url.search = new URLSearchParams({
      pubStartDate: isoNoZone(start),
      pubEndDate: isoNoZone(end),
      cvssV3Severity: "CRITICAL",
      resultsPerPage: "200",
    }).toString();
    const headers: Record<string, string> = { "User-Agent": UA };
    if (process.env.NVD_API_KEY) headers.apiKey = process.env.NVD_API_KEY;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) });
    if (!res.ok) throw new Error(`NVD ${res.status}`);
    const json = (await res.json()) as { vulnerabilities: NvdCve[] };
    return json.vulnerabilities.map(({ cve }) => {
      const { score, severity } = nvdScore(cve);
      const { vendor, product } = vendorProductFromCpe(cve);
      const description = cve.descriptions.find((d) => d.lang === "en")?.value ?? "";
      return {
        cve: cve.id,
        vendor,
        product,
        name: description.split(/(?<=\.)\s/)[0]?.slice(0, 140) ?? cve.id,
        description,
        kev: false,
        ransomware: false,
        cvss: score,
        severity: severity ?? "CRITICAL",
        published: cve.published,
        references: (cve.references ?? []).slice(0, 4).map((r) => r.url),
        cwe: cve.weaknesses?.[0]?.description?.[0]?.value,
      } satisfies Vuln;
    });
  });
  if (result.ok) cacheLife("hours");
  else cacheLife("minutes");
  return result;
}

/** CVE JSON 5 record, as served by CVE.org and mirrored by CIRCL. Only the fields we read. */
interface CveRecord {
  cveMetadata: { cveId: string; state?: string; datePublished?: string; assignerShortName?: string };
  containers: {
    cna: CveContainer & { title?: string; affected?: { vendor?: string; product?: string; packageName?: string }[] };
    adp?: CveContainer[];
  };
}

interface CveContainer {
  descriptions?: { lang: string; value: string }[];
  metrics?: Record<string, { baseScore?: number } | undefined>[];
  references?: { url: string }[];
  problemTypes?: { descriptions?: { cweId?: string }[] }[];
}

function severityOf(score: number | undefined): Vuln["severity"] {
  if (score === undefined) return undefined;
  if (score >= 9) return "CRITICAL";
  if (score >= 7) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
}

const VAGUE = /^(n\/a|unknown|unspecified|-)$/i;

/** The highest CVSS any container gives (the CNA's own, or CISA's enrichment), with a plain Vuln shape. */
function cveRecordToVuln(record: CveRecord): Vuln {
  const { cna, adp = [] } = record.containers;
  let score: number | undefined;
  for (const container of [cna, ...adp]) {
    for (const metric of container.metrics ?? []) {
      for (const key of ["cvssV4_0", "cvssV3_1", "cvssV3_0"]) {
        const value = metric[key]?.baseScore;
        if (typeof value === "number" && (score === undefined || value > score)) score = value;
      }
    }
  }
  const affected = cna.affected?.find((item) => (item.vendor && !VAGUE.test(item.vendor)) || item.product) ?? {};
  const vendor = affected.vendor && !VAGUE.test(affected.vendor) ? affected.vendor : "";
  const product = affected.product && !VAGUE.test(affected.product) ? affected.product : (affected.packageName ?? "");
  const description = cna.descriptions?.find((d) => d.lang.startsWith("en"))?.value ?? "";
  return {
    cve: record.cveMetadata.cveId,
    vendor,
    product,
    name: (cna.title || description.split(/(?<=\.)\s/)[0] || record.cveMetadata.cveId).slice(0, 140),
    description,
    kev: false,
    ransomware: false,
    cvss: score,
    severity: severityOf(score),
    published: record.cveMetadata.datePublished,
    references: (cna.references ?? []).slice(0, 8).map((r) => r.url),
    cwe: cna.problemTypes?.[0]?.descriptions?.[0]?.cweId,
  };
}

async function nvdLookup(cveId: string): Promise<Vuln | null> {
  const headers: Record<string, string> = { "User-Agent": UA };
  if (process.env.NVD_API_KEY) headers.apiKey = process.env.NVD_API_KEY;
  const res = await fetch(`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cveId)}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`NVD ${res.status}`);
  const json = (await res.json()) as { vulnerabilities: NvdCve[] };
  const cve = json.vulnerabilities[0]?.cve;
  if (!cve) return null;
  const { score, severity } = nvdScore(cve);
  const { vendor, product } = vendorProductFromCpe(cve);
  const description = cve.descriptions.find((d) => d.lang === "en")?.value ?? "";
  return {
    cve: cve.id,
    vendor,
    product,
    name: description.split(/(?<=\.)\s/)[0]?.slice(0, 140) ?? cve.id,
    description,
    kev: false,
    ransomware: false,
    cvss: score,
    severity,
    published: cve.published,
    references: (cve.references ?? []).slice(0, 8).map((r) => r.url),
    cwe: cve.weaknesses?.[0]?.description?.[0]?.value,
  };
}

/**
 * Look up one CVE (CVE pages, the fix runbook, CVEs named in the news). CVE.org first: it is the source
 * of record, current within minutes and not rate limited the way NVD is without a key. NVD fills in when
 * CVE.org is down. A 404 is a real "no such CVE"; anything else fails so it is not cached as one.
 */
export async function getCveRecord(cveId: string): Promise<Vuln | null> {
  return unwrap(await getCveRecordFetched(cveId));
}

async function getCveRecordFetched(cveId: string): Promise<Fetched<Vuln | null>> {
  "use cache: remote";
  const result = await settle(async () => {
    try {
      const res = await fetch(`https://cveawg.mitre.org/api/cve/${encodeURIComponent(cveId)}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`CVE.org ${res.status}`);
      const record = (await res.json()) as CveRecord;
      return record.cveMetadata?.state === "REJECTED" ? null : cveRecordToVuln(record);
    } catch {
      return nvdLookup(cveId);
    }
  });
  if (result.ok) cacheLife("lookup");
  else cacheLife("minutes");
  return result;
}

/**
 * Critical CVEs published in the last day or so, straight from the CVE list as CIRCL's
 * vulnerability-lookup mirrors it: minutes old, where NVD's feed lags and rate limits.
 */
export async function getLatestCriticalCves(): Promise<Vuln[]> {
  return unwrap(await getLatestCriticalCvesFetched());
}

async function getLatestCriticalCvesFetched(): Promise<Fetched<Vuln[]>> {
  "use cache";
  const result = await settle(async () => {
    return withLastGood("circl-latest", async () => {
      const page = async (n: number) => {
        const url = `https://vulnerability.circl.lu/api/vulnerability/?source=cvelistv5&date_sort=published&sort_order=desc&per_page=100&page=${n}`;
        const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`CIRCL ${res.status}`);
        return (await res.json()) as CveRecord[];
      };
      const pages = await Promise.allSettled([page(1), page(2)]);
      if (!pages.some((p) => p.status === "fulfilled")) throw new Error("CIRCL vulnerability-lookup unavailable");
      return pages
        .flatMap((p) => (p.status === "fulfilled" ? p.value : []))
        .filter((record) => record.cveMetadata?.state === "PUBLISHED")
        .map(cveRecordToVuln)
        .filter((vuln) => (vuln.cvss ?? 0) >= 9 && (vuln.vendor || vuln.product));
    });
  });
  if (result.ok) cacheLife("feed");
  else cacheLife("minutes");
  return result;
}

interface GhsaAdvisory {
  ghsa_id: string;
  cve_id: string | null;
  summary: string;
  description?: string;
  severity: string;
  published_at: string;
  html_url: string;
  cvss?: { score: number | null };
  cvss_severities?: { cvss_v3?: { score: number | null }; cvss_v4?: { score: number | null } };
  vulnerabilities?: { package?: { ecosystem: string; name: string } | null; vulnerable_version_range?: string; first_patched_version?: string | null }[];
}

async function ghsa(params: Record<string, string>): Promise<GhsaAdvisory[]> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/advisories?${new URLSearchParams(params)}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GHSA ${res.status}`);
  return (await res.json()) as GhsaAdvisory[];
}

/** Malicious packages GitHub published in the advisory database (CC BY 4.0). */
export async function getMalwarePackages(): Promise<MalwarePackage[]> {
  return unwrap(await getMalwarePackagesFetched());
}

async function getMalwarePackagesFetched(): Promise<Fetched<MalwarePackage[]>> {
  "use cache";
  const result = await settle(async () => {
    const advisories = await withLastGood("ghsa-malware", () => ghsa({ type: "malware", per_page: "60", sort: "published", direction: "desc" }));
    return advisories.map((a) => ({
      id: a.ghsa_id,
      ecosystem: a.vulnerabilities?.[0]?.package?.ecosystem ?? "unknown",
      name: a.vulnerabilities?.[0]?.package?.name ?? a.summary.replace(/^Malicious code in\s+/i, ""),
      summary: a.summary,
      published: a.published_at,
      url: a.html_url,
    }));
  });
  if (result.ok) cacheLife("feed");
  else cacheLife("minutes");
  return result;
}

/** Recent critical reviewed advisories for open-source packages. */
export async function getCriticalAdvisories(): Promise<Vuln[]> {
  return unwrap(await getCriticalAdvisoriesFetched());
}

async function getCriticalAdvisoriesFetched(): Promise<Fetched<Vuln[]>> {
  "use cache";
  const result = await settle(async () => {
    const advisories = await withLastGood("ghsa-critical", () =>
      ghsa({ type: "reviewed", severity: "critical", per_page: "40", sort: "published", direction: "desc" }),
    );
    return advisories
      .filter((a) => a.cve_id)
      .map((a) => {
        const pkg = a.vulnerabilities?.[0]?.package;
        return {
          cve: a.cve_id as string,
          vendor: pkg?.ecosystem ?? "",
          product: pkg?.name ?? "",
          name: a.summary,
          description: a.summary,
          kev: false,
          ransomware: false,
          cvss: a.cvss_severities?.cvss_v4?.score ?? a.cvss_severities?.cvss_v3?.score ?? a.cvss?.score ?? undefined,
          severity: "CRITICAL",
          published: a.published_at,
          references: [a.html_url],
        } satisfies Vuln;
      });
  });
  if (result.ok) cacheLife("feed");
  else cacheLife("minutes");
  return result;
}

const CVE_NEWS_QUERIES = [
  "actively exploited vulnerability",
  "zero-day exploited in the wild",
  "critical vulnerability patch now",
  "CVE exploited attacks",
  "emergency security update",
];

/** How many distinct news articles in the last week mention each CVE (Valyu news search). */
export async function getCveNewsMentions(): Promise<Record<string, number>> {
  return unwrap(await getCveNewsMentionsFetched());
}

async function getCveNewsMentionsFetched(): Promise<Fetched<Record<string, number>>> {
  "use cache: remote";
  const result = await settle(async () => {
    return withLastGood("valyu-cve-news", async () => {
      const valyu = valyuServer();
      if (!valyu) return {};
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 86_400_000);
      const day = (d: Date) => d.toISOString().slice(0, 10);
      const results = await Promise.allSettled(
        CVE_NEWS_QUERIES.map((query) =>
          valyu.search(query, { searchType: "news", maxNumResults: 20, startDate: day(start), endDate: day(end), responseLength: "medium" }),
        ),
      );
      if (!results.some((result) => result.status === "fulfilled" && result.value.success)) throw new Error("Valyu CVE news search failed");
      const perCve = new Map<string, Set<string>>();
      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value.success) continue;
        for (const item of result.value.results) {
          const text = `${item.title} ${typeof item.content === "string" ? item.content : ""}`;
          for (const match of new Set(text.toUpperCase().match(/CVE-\d{4}-\d{4,7}/g) ?? [])) {
            const set = perCve.get(match) ?? new Set<string>();
            set.add(item.url);
            perCve.set(match, set);
          }
        }
      }
      return Object.fromEntries([...perCve.entries()].map(([cve, urls]) => [cve, urls.size]));
    });
  });
  if (result.ok) cacheLife("hours");
  else cacheLife("minutes");
  return result;
}
