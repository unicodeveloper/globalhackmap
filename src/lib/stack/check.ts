import "server-only";

import { getSnapshot } from "@/lib/snapshot";
import { getEpss, getKevCatalog } from "@/lib/sources/vulns";
import { type OsvRecord, firstFixed, getOsvRecord, pool, queryOsv } from "@/lib/stack/osv";
import { parseStack } from "@/lib/stack/parse";
import { matchProducts, productsExploited } from "@/lib/stack/products";
import { MAX_INPUT_BYTES, type FindingTier, type PackageFinding, type StackPackage, type StackReport, type UnexpandedAdvisories } from "@/lib/stack/types";
import type { Vuln } from "@/lib/types";

export type { StackReport } from "@/lib/stack/types";

/** Advisory details fetched per check. Each is cached for a day, so repeat checks are fast. */
const DETAIL_CAP = 60;
const HIGH_EPSS = 0.1;
const WATCHLIST_CAP = 40;

/** The input itself is unusable (too large). Safe to show to the person who pasted it. */
export class StackInputError extends Error {
  override name = "StackInputError";
}

/** MAL first, then GitHub's reviewed advisories (they carry CVE aliases and severity), then the rest. */
function idRank(id: string): number {
  if (id.startsWith("MAL-")) return 0;
  if (id.startsWith("GHSA-")) return 1;
  if (id.startsWith("PYSEC-")) return 3;
  return 2;
}

/** Pick which advisory IDs to expand: every malicious one, then round-robin so each affected package gets coverage. */
function chooseIds(perPackage: string[][]): string[] {
  const chosen = new Set<string>();
  for (const ids of perPackage) for (const id of ids) if (id.startsWith("MAL-")) chosen.add(id);
  const queues = perPackage.map((ids) => [...ids].sort((a, b) => idRank(a) - idRank(b) || a.localeCompare(b)));
  for (let round = 0; chosen.size < DETAIL_CAP; round++) {
    let any = false;
    for (const queue of queues) {
      if (round < queue.length) {
        any = true;
        chosen.add(queue[round]);
        if (chosen.size >= DETAIL_CAP) break;
      }
    }
    if (!any) break;
  }
  return [...chosen];
}

/** Group a package's advisories that describe the same issue (a GHSA and a PYSEC sharing a CVE). */
function groupRecords(records: OsvRecord[]): OsvRecord[][] {
  const groups: { keys: Set<string>; records: OsvRecord[] }[] = [];
  for (const record of records) {
    const keys = new Set([record.id, ...record.aliases]);
    const hits = groups.filter((group) => [...keys].some((key) => group.keys.has(key)));
    const merged = { keys, records: [record] };
    for (const hit of hits) {
      for (const key of hit.keys) merged.keys.add(key);
      merged.records.push(...hit.records);
      groups.splice(groups.indexOf(hit), 1);
    }
    groups.push(merged);
  }
  return groups.map((group) => group.records.sort((a, b) => idRank(a.id) - idRank(b.id)));
}

function tierOf(finding: Omit<PackageFinding, "tier">): FindingTier {
  if (finding.kind === "malicious") return 0;
  if (finding.kev) return 1;
  if ((finding.epss?.score ?? 0) >= HIGH_EPSS) return 2;
  if (finding.severity === "CRITICAL" || (finding.cvss ?? 0) >= 9) return 3;
  return 4;
}

function safeName(name: string): string | null {
  const clean = name.replace(/[^\w@./:+ -]/g, "").trim();
  return clean.length > 0 && clean.length <= 100 ? clean : null;
}

/**
 * Check a pasted manifest, lockfile or product list against OSV (vulnerabilities and malicious packages),
 * CISA KEV (exploited in the wild) and FIRST EPSS. Nothing is logged or stored.
 */
export async function checkStack(input: string, options: { filename?: string } = {}): Promise<StackReport> {
  if (new TextEncoder().encode(input).length > MAX_INPUT_BYTES) {
    throw new StackInputError("That is larger than 500 KB. Paste the lockfile for one project at a time.");
  }
  const parsed = parseStack(input, options.filename);
  const notes: string[] = [];
  const sources = { osv: true, kev: true, epss: true };

  const [kevCatalog, perPackage, trending] = await Promise.all([
    getKevCatalog().catch(() => {
      sources.kev = false;
      return [] as Vuln[];
    }),
    parsed.packages.length
      ? queryOsv(parsed.packages).catch(() => {
          sources.osv = false;
          return parsed.packages.map(() => [] as string[]);
        })
      : Promise.resolve([] as string[][]),
    parsed.products.length
      ? getSnapshot()
          .then((snapshot) => snapshot.trending)
          .catch(() => [] as Vuln[])
      : Promise.resolve([] as Vuln[]),
  ]);

  // Expand the advisories we will show, each cached for a day.
  const chosen = chooseIds(perPackage);
  const fetched = await pool(chosen, 10, (id) => getOsvRecord(id).catch(() => null));
  const records = new Map<string, OsvRecord>();
  chosen.forEach((id, index) => {
    const record = fetched[index];
    if (record && !record.withdrawn) records.set(id, record);
  });
  const failedDetails = fetched.filter((record) => record === null).length;

  const kevById = new Map(kevCatalog.map((vuln) => [vuln.cve, vuln]));
  const drafts: Omit<PackageFinding, "tier">[] = [];
  const unexpanded: UnexpandedAdvisories[] = [];

  parsed.packages.forEach((pkg: StackPackage, index) => {
    const ids = perPackage[index] ?? [];
    if (!ids.length) return;
    const mine = ids.map((id) => records.get(id)).filter((record): record is OsvRecord => Boolean(record));
    const covered = new Set(mine.flatMap((record) => [record.id, ...record.aliases]));
    const missing = ids.filter((id) => !covered.has(id) && !chosen.includes(id));
    if (missing.length) unexpanded.push({ ecosystem: pkg.ecosystem, package: pkg.name, version: pkg.version, ids: missing });

    // Every malicious advisory for one package is the same instruction: treat the machine as compromised.
    const grouped = groupRecords(mine);
    const malicious = grouped.filter((group) => group.some((record) => record.malicious)).flat();
    const groups = [
      ...(malicious.length ? [malicious.sort((a, b) => idRank(a.id) - idRank(b.id))] : []),
      ...grouped.filter((group) => !group.some((record) => record.malicious)),
    ];

    for (const group of groups) {
      const primary = group[0];
      const aliases = [...new Set(group.flatMap((record) => [record.id, ...record.aliases]))].filter((id) => id !== primary.id);
      const cves = [...new Set([primary.id, ...aliases].filter((id) => /^CVE-\d{4}-\d{4,}$/.test(id)))];
      const kevHit = cves.map((cve) => kevById.get(cve)).find(Boolean);
      const malicious = group.some((record) => record.malicious);
      const cvss = group.map((record) => record.cvss).find((score) => score !== undefined);
      drafts.push({
        id: primary.id,
        kind: malicious ? "malicious" : "vulnerability",
        ecosystem: pkg.ecosystem,
        package: pkg.name,
        version: pkg.version,
        ranged: Boolean(pkg.ranged),
        fixed: malicious ? undefined : group.map((record) => firstFixed(record, pkg)).find(Boolean),
        summary: primary.summary,
        aliases,
        cves,
        severity: group.map((record) => record.severity).find(Boolean),
        cvss,
        kev: kevHit ? { cve: kevHit.cve, name: kevHit.name, added: kevHit.kevAdded ?? "", due: kevHit.kevDue, ransomware: kevHit.ransomware } : undefined,
        published: primary.published,
        url: `https://osv.dev/vulnerability/${encodeURIComponent(primary.id)}`,
      });
    }
  });

  // Products: name matching against KEV and this week's trending list.
  const products = matchProducts(parsed.products, kevCatalog, trending);

  // One EPSS call for every CVE we will show.
  const allCves = [...drafts.flatMap((draft) => draft.cves), ...products.flatMap((product) => [...product.matches, ...product.news].map((m) => m.cve))];
  const epss = allCves.length
    ? await getEpss(allCves).catch(() => {
        sources.epss = false;
        return new Map<string, { epss: number; percentile: number }>();
      })
    : new Map<string, { epss: number; percentile: number }>();

  const findings: PackageFinding[] = drafts
    .map((draft) => {
      const scores = draft.cves.map((cve) => epss.get(cve)).filter(Boolean) as { epss: number; percentile: number }[];
      const best = scores.sort((a, b) => b.epss - a.epss)[0];
      const withEpss = best ? { ...draft, epss: { score: best.epss, percentile: best.percentile } } : draft;
      return { ...withEpss, tier: tierOf(withEpss) };
    })
    .sort((a, b) => a.tier - b.tier || (b.epss?.score ?? 0) - (a.epss?.score ?? 0) || (b.cvss ?? 0) - (a.cvss ?? 0) || a.package.localeCompare(b.package));

  for (const product of products) {
    for (const match of [...product.matches, ...product.news]) {
      const score = epss.get(match.cve);
      if (score) match.epss = score.epss;
    }
  }

  const affected = new Set(findings.map((finding) => `${finding.ecosystem}:${finding.package}`));
  const unique = (tier: FindingTier) => new Set(findings.filter((finding) => finding.tier === tier).map((finding) => `${finding.package}:${finding.id}`)).size;

  // Names worth watching every day: affected packages, then direct dependencies, then the rest, then products.
  const watch: string[] = [];
  const push = (name: string) => {
    const clean = safeName(name);
    if (clean && !watch.includes(clean) && watch.length < WATCHLIST_CAP) watch.push(clean);
  };
  for (const finding of findings) push(finding.package);
  for (const pkg of parsed.packages) if (pkg.direct) push(pkg.name);
  for (const pkg of parsed.packages) push(pkg.name);
  for (const product of parsed.products) push(product.name);

  if (!sources.osv) notes.push("The OSV database did not answer, so package results are missing. Try again in a minute.");
  if (!sources.kev) notes.push("CISA's exploited list did not load, so nothing could be marked as exploited. Try again in a minute.");
  if (!sources.epss) notes.push("Exploit likelihood scores (EPSS) did not load. Everything else is complete.");
  if (failedDetails)
    notes.push(`${failedDetails} advisory ${failedDetails === 1 ? "record" : "records"} did not load and ${failedDetails === 1 ? "is" : "are"} left out.`);
  if (unexpanded.length) {
    const count = unexpanded.reduce((sum, entry) => sum + entry.ids.length, 0);
    notes.push(
      `${count} more advisory ${count === 1 ? "ID was" : "IDs were"} not expanded to keep the check fast. They are listed under other known vulnerabilities.`,
    );
  }
  if (parsed.truncated)
    notes.push(`Only the first ${parsed.packages.length.toLocaleString("en")} of ${parsed.total.toLocaleString("en")} packages were checked.`);
  if (parsed.skipped)
    notes.push(
      `${parsed.skipped} ${parsed.skipped === 1 ? "entry had" : "entries had"} no exact version (a tag, git URL or bare name) and ${parsed.skipped === 1 ? "was" : "were"} skipped.`,
    );

  return {
    format: parsed.format,
    checkedAt: new Date().toISOString(),
    counts: {
      packages: parsed.packages.length,
      products: parsed.products.length,
      vulnerablePackages: affected.size,
      malicious: new Set(findings.filter((finding) => finding.tier === 0).map((finding) => finding.package)).size,
      exploited: unique(1),
      likely: unique(2),
      critical: unique(3),
      known: findings.length,
      productsExploited: productsExploited(products),
    },
    ranged: parsed.ranged,
    truncated: parsed.truncated,
    totalParsed: parsed.total,
    findings,
    products,
    unexpanded,
    watchlist: watch,
    sources,
    notes,
  };
}
