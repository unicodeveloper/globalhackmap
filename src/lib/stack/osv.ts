import "server-only";

import { type Fetched, settle, unwrap } from "@/lib/fetched";

import { cacheLife } from "next/cache";

import type { Ecosystem, Severity, StackPackage } from "@/lib/stack/types";
import { compareVersions } from "@/lib/stack/version";

const OSV = "https://api.osv.dev/v1";
const UA = "GlobalHackMap/1.0 (+https://github.com/yorkeccak/globalhackmap)";
const BATCH = 1000;

interface OsvEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  limit?: string;
}

interface OsvRaw {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  upstream?: string[];
  published?: string;
  withdrawn?: string;
  severity?: { type: string; score: string }[];
  database_specific?: { severity?: string };
  affected?: {
    package?: { ecosystem: string; name: string };
    ranges?: { type: string; events: OsvEvent[] }[];
  }[];
}

/** The part of an OSV record we keep. Small enough to cache per ID. */
export interface OsvRecord {
  id: string;
  summary: string;
  aliases: string[];
  published?: string;
  withdrawn: boolean;
  malicious: boolean;
  severity?: Severity;
  cvss?: number;
  affected: { ecosystem: string; name: string; ranges: OsvEvent[][] }[];
}

// ---------------------------------------------------------------------------
// CVSS v3 base score from a vector (FIRST CVSS v3.1 specification, section 7)
// ---------------------------------------------------------------------------

const W = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
} as const;

function roundUp(value: number): number {
  const int = Math.round(value * 100_000);
  return int % 10_000 === 0 ? int / 100_000 : (Math.floor(int / 10_000) + 1) / 10;
}

export function cvss3Score(vector: string): number | undefined {
  if (!/^CVSS:3\.[01]\//.test(vector)) return undefined;
  const m = Object.fromEntries(
    vector
      .split("/")
      .slice(1)
      .map((part) => part.split(":")),
  ) as Record<string, string>;
  const av = W.AV[m.AV as keyof typeof W.AV];
  const ac = W.AC[m.AC as keyof typeof W.AC];
  const ui = W.UI[m.UI as keyof typeof W.UI];
  const c = W.CIA[m.C as keyof typeof W.CIA];
  const i = W.CIA[m.I as keyof typeof W.CIA];
  const a = W.CIA[m.A as keyof typeof W.CIA];
  const changed = m.S === "C";
  const pr = m.PR === "N" ? 0.85 : m.PR === "L" ? (changed ? 0.68 : 0.62) : m.PR === "H" ? (changed ? 0.5 : 0.27) : undefined;
  if ([av, ac, ui, c, i, a, pr].some((value) => value === undefined)) return undefined;
  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  const exploitability = 8.22 * av * ac * pr! * ui;
  if (impact <= 0) return 0;
  return roundUp(Math.min(changed ? 1.08 * (impact + exploitability) : impact + exploitability, 10));
}

function severityFrom(label: string | undefined, cvss: number | undefined): Severity | undefined {
  const upper = label?.toUpperCase();
  if (upper === "CRITICAL" || upper === "HIGH" || upper === "LOW") return upper;
  if (upper === "MODERATE" || upper === "MEDIUM") return "MODERATE";
  if (cvss === undefined) return undefined;
  if (cvss >= 9) return "CRITICAL";
  if (cvss >= 7) return "HIGH";
  if (cvss >= 4) return "MODERATE";
  return "LOW";
}

/** GitHub malware advisories and compromised-release advisories that have no MAL- record. */
const MALWARE_SUMMARY =
  /\b(malicious (code|package|versions?|releases?)|credential (harvest|steal)\w*|backdoor(ed)?|compromised (packages?|releases?|versions?))\b/i;

function compact(raw: OsvRaw): OsvRecord {
  const vector = raw.severity?.find((s) => s.type === "CVSS_V3")?.score;
  const cvss = vector ? cvss3Score(vector) : undefined;
  const aliases = [...new Set([...(raw.aliases ?? []), ...(raw.upstream ?? [])])];
  const summary = (raw.summary || raw.details?.split(/\n|(?<=\.)\s/)[0] || raw.id).replace(/\s+/g, " ").trim().slice(0, 220);
  return {
    id: raw.id,
    summary,
    aliases,
    published: raw.published,
    withdrawn: Boolean(raw.withdrawn),
    malicious: raw.id.startsWith("MAL-") || aliases.some((alias) => alias.startsWith("MAL-")) || MALWARE_SUMMARY.test(summary),
    severity: severityFrom(raw.database_specific?.severity, cvss),
    cvss,
    affected: (raw.affected ?? [])
      .filter((entry) => entry.package)
      .map((entry) => ({
        ecosystem: entry.package!.ecosystem,
        name: entry.package!.name,
        ranges: (entry.ranges ?? []).filter((range) => range.type !== "GIT").map((range) => range.events),
      })),
  };
}

/** One OSV advisory, compacted and cached for a day (advisories change rarely). */
export async function getOsvRecord(id: string): Promise<OsvRecord | null> {
  return unwrap(await getOsvRecordFetched(id));
}

async function getOsvRecordFetched(id: string): Promise<Fetched<OsvRecord | null>> {
  "use cache";
  const result = await settle(async () => {
    const res = await fetch(`${OSV}/vulns/${encodeURIComponent(id)}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`OSV ${res.status}`);
    return compact((await res.json()) as OsvRaw);
  });
  if (result.ok) cacheLife("days");
  else cacheLife("minutes");
  return result;
}

/** Advisory IDs affecting each package, in the same order as the input. */
export async function queryOsv(packages: StackPackage[]): Promise<string[][]> {
  const out: string[][] = [];
  const chunks: StackPackage[][] = [];
  for (let i = 0; i < packages.length; i += BATCH) chunks.push(packages.slice(i, i + BATCH));
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const res = await fetch(`${OSV}/querybatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA },
        body: JSON.stringify({
          queries: chunk.map((pkg) => ({ package: { ecosystem: pkg.ecosystem, name: pkg.name }, version: pkg.version })),
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`OSV ${res.status}`);
      const json = (await res.json()) as { results: { vulns?: { id: string }[] }[] };
      return json.results.map((result) => (result.vulns ?? []).map((vuln) => vuln.id));
    }),
  );
  for (const chunk of results) out.push(...chunk);
  return out;
}

/** Run tasks with a small concurrency limit so a big lockfile does not open 60 sockets at once. */
export async function pool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index]);
      }
    }),
  );
  return results;
}

// ---------------------------------------------------------------------------
// Versions and fixes
// ---------------------------------------------------------------------------

export function normaliseName(ecosystem: Ecosystem | string, name: string): string {
  return ecosystem === "PyPI" ? name.toLowerCase().replace(/[-_.]+/g, "-") : ecosystem === "Packagist" ? name.toLowerCase() : name;
}

/** The fix for the release line the installed version is on (next 15.1.0 is fixed by 15.1.9, not 15.0.5). */
export function firstFixed(record: OsvRecord, pkg: StackPackage): string | undefined {
  const name = normaliseName(pkg.ecosystem, pkg.name);
  const entries = record.affected.filter((entry) => entry.ecosystem === pkg.ecosystem && normaliseName(entry.ecosystem, entry.name) === name);
  const fixes: string[] = [];
  for (const entry of entries) {
    for (const events of entry.ranges) {
      let introduced: string | undefined;
      for (const event of events) {
        if (event.introduced !== undefined) introduced = event.introduced;
        if (event.fixed) {
          fixes.push(event.fixed);
          const after = introduced === undefined || introduced === "0" || compareVersions(pkg.version, introduced) >= 0;
          if (after && compareVersions(pkg.version, event.fixed) < 0) return event.fixed;
        }
      }
    }
  }
  return fixes.filter((fix) => compareVersions(fix, pkg.version) > 0).sort(compareVersions)[0];
}
