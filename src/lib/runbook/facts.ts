import { z } from "zod";

import type { OsvRecord } from "@/lib/runbook/osv";

// Pure helpers behind the fix runbook. No server-only imports, so they can be unit tested.

const STATUS = z.enum(["affected", "unaffected", "unknown"]);

/**
 * Drops malformed upstream entries one at a time instead of rejecting the whole record. `.optional()`
 * matters: zod 4 treats a missing key as invalid even for `z.unknown()` unless it is marked optional.
 */
function lenient<T extends z.ZodType>(schema: T) {
  return z
    .unknown()
    .optional()
    .transform((items) =>
      (Array.isArray(items) ? items : []).flatMap((item) => {
        const parsed = schema.safeParse(item);
        return parsed.success ? [parsed.data as z.output<T>] : [];
      }),
    );
}

const cveVersion = z.object({
  version: z.string(),
  status: STATUS,
  lessThan: z.string().optional(),
  lessThanOrEqual: z.string().optional(),
  changes: lenient(z.object({ at: z.string(), status: STATUS })),
});

const cveContainer = z.object({
  providerMetadata: z.object({ shortName: z.string().optional() }).optional(),
  affected: lenient(
    z.object({
      vendor: z.string().optional(),
      product: z.string().optional(),
      packageName: z.string().optional(),
      repo: z.string().optional(),
      platforms: lenient(z.string()),
      modules: lenient(z.string()),
      defaultStatus: z.string().optional(),
      versions: lenient(cveVersion),
    }),
  ),
  references: lenient(z.object({ url: z.string(), tags: lenient(z.string()) })),
  metrics: lenient(z.record(z.string(), z.unknown())),
});

/** CVE JSON 5 record as CVE.org serves it. Only the fields the runbook reads. */
export const cveRecordSchema = z.object({
  cveMetadata: z.object({ cveId: z.string(), state: z.string().optional(), assignerShortName: z.string().optional() }),
  containers: z.object({ cna: cveContainer, adp: lenient(cveContainer) }),
});

export type CveRecordJson = z.output<typeof cveRecordSchema>;
export type CveVersion = z.output<typeof cveVersion>;

export interface CveProduct {
  /** Who published the version data: the CNA (usually the vendor) or an ADP enricher such as CISA. */
  source: string;
  /**
   * Only the CNA's range ends are fixed releases. CISA's ADP ranges come from CPE matching: for MOVEit
   * they end at 2021.0.7 where the vendor's fix is 2021.0.6, and one ends at 2020.0, which fixes nothing.
   */
  cna: boolean;
  vendor: string;
  product: string;
  packageName?: string;
  repo?: string;
  platforms: string[];
  modules: string[];
  defaultStatus?: string;
  versions: CveVersion[];
}

export interface Reference {
  url: string;
  tags: string[];
  /** Listed by the CNA itself, which is usually the vendor. */
  cna?: boolean;
}

export interface CveFacts {
  assigner?: string;
  products: CveProduct[];
  references: Reference[];
  scores: { score: number; version: string }[];
}

const VAGUE = /^(n\/a|unknown|unspecified|-|\*)?$/i;

const named = (value?: string) => (value && !VAGUE.test(value.trim()) ? value.trim() : "");

/** A usable version boundary. Wildcards such as "log4j-core*" or "*" bound nothing. */
const bound = (value?: string) => (value && named(value) && !value.includes("*") ? value.trim() : undefined);

const meaningful = (version: CveVersion) =>
  Boolean(named(version.version) || bound(version.lessThan) || bound(version.lessThanOrEqual) || version.changes.length);

/** Versions where an affected range ends: a `changes` entry back to unaffected, or the `lessThan` bound. */
export function firstUnaffected(version: CveVersion): string[] {
  if (version.status !== "affected") return [];
  const fixed = version.changes.filter((change) => change.status === "unaffected").map((change) => change.at);
  const end = bound(version.lessThan);
  return end ? [...fixed, end] : fixed;
}

/** A single version the record marks unaffected, which is often (not always) the fixed release. */
export function markedUnaffected(version: CveVersion): string | undefined {
  if (version.status !== "unaffected" || version.lessThan || version.lessThanOrEqual) return undefined;
  const value = named(version.version);
  return value && value !== "0" ? value : undefined;
}

export function readCveRecord(record: CveRecordJson): CveFacts {
  const { cna, adp } = record.containers;
  const assigner = record.cveMetadata.assignerShortName;

  const productsOf = (container: CveRecordJson["containers"]["cna"], source: string, isCna: boolean): CveProduct[] => {
    const products = new Map<string, CveProduct>();
    for (const item of container.affected) {
      const versions = item.versions.filter(meaningful);
      if (!versions.length) continue;
      const product: CveProduct = {
        source,
        cna: isCna,
        vendor: named(item.vendor),
        product: named(item.product) || named(item.packageName),
        packageName: named(item.packageName) || undefined,
        repo: item.repo,
        platforms: item.platforms,
        modules: item.modules,
        defaultStatus: item.defaultStatus,
        versions,
      };
      // CISA's enrichment repeats a product once per CPE; merge those, but never across different platforms.
      const key = JSON.stringify([
        product.vendor,
        product.product,
        product.packageName,
        product.platforms,
        product.modules,
        product.defaultStatus,
      ]).toLowerCase();
      const existing = products.get(key);
      if (existing)
        existing.versions.push(...versions.filter((version) => !existing.versions.some((other) => JSON.stringify(other) === JSON.stringify(version))));
      else products.set(key, product);
    }
    return [...products.values()];
  };

  // The CNA's data is authoritative. ADP enrichment fills in only when the CNA gave no usable versions.
  let products = productsOf(cna, assigner ? `${assigner}, the CNA` : "the CNA", true);
  for (const container of adp) {
    if (products.length) break;
    const name = container.providerMetadata?.shortName;
    products = productsOf(container, name ? `${name}, an ADP enricher` : "an ADP enricher", false);
  }

  const scores: CveFacts["scores"] = [];
  for (const container of [cna, ...adp]) {
    for (const metric of container.metrics) {
      for (const [key, value] of Object.entries(metric)) {
        const version = /^cvssV(\d)_(\d)$/.exec(key);
        const score = (value as { baseScore?: unknown } | null)?.baseScore;
        if (version && typeof score === "number") scores.push({ score, version: `${version[1]}.${version[2]}` });
      }
    }
  }

  return {
    assigner,
    products,
    references: [
      ...cna.references.map((ref) => ({ url: ref.url, tags: ref.tags, cna: true })),
      ...adp.flatMap((container) => container.references.map((ref) => ({ url: ref.url, tags: ref.tags }))),
    ],
    scores,
  };
}

type OsvAffected = OsvRecord["affected"][number];

/** One entry per package (or source repository), so detection commands are not repeated for every range. */
export function groupAffected(list: OsvAffected[]): OsvAffected[] {
  const groups = new Map<string, OsvAffected>();
  for (const item of list) {
    const key = item.package
      ? JSON.stringify([item.package.ecosystem, item.package.name])
      : JSON.stringify(["repo", ...new Set(item.ranges.map((range) => range.repo ?? ""))]);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { ...item, versions: [...new Set(item.versions)], ranges: [...item.ranges] });
      continue;
    }
    const ranges = new Map([...group.ranges, ...item.ranges].map((range) => [JSON.stringify(range), range]));
    group.ranges = [...ranges.values()];
    group.versions = [...new Set([...group.versions, ...item.versions])];
  }
  return [...groups.values()];
}

/** Release-version fixes per OSV package (never Git commits), with packages that share one fix list folded together. */
export function osvFixed(groups: OsvAffected[]): { ecosystem: string; names: string[]; fixed: string[] }[] {
  const out = new Map<string, { ecosystem: string; names: string[]; fixed: string[] }>();
  for (const group of groups) {
    if (!group.package) continue;
    const fixed = [
      ...new Set(group.ranges.filter((range) => range.type !== "GIT").flatMap((range) => range.events.flatMap((event) => (event.fixed ? [event.fixed] : [])))),
    ];
    if (!fixed.length) continue;
    const key = JSON.stringify([group.package.ecosystem, fixed]);
    const entry = out.get(key) ?? { ecosystem: group.package.ecosystem, names: [], fixed };
    entry.names.push(group.package.name);
    out.set(key, entry);
  }
  return [...out.values()];
}

/**
 * Product names split into searchable pieces: nobody's config contains "Connect Secure, Policy Secure,
 * and ZTA Gateways", but it may contain "Connect Secure". The search is a case-insensitive substring
 * match, so a term that contains a shorter kept term adds nothing and is dropped.
 */
export function searchTerms(names: string[]): string[] {
  const parts = names
    .flatMap((name) => name.split(/\s*(?:[,;/()]|\band\b)\s*/i))
    .map((part) =>
      part
        .replace(/[\u0000-\u001f\u007f\u2014]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((part) => part.length >= 2 && !VAGUE.test(part));
  const kept: string[] = [];
  for (const part of [...parts].sort((a, b) => a.length - b.length)) {
    if (!kept.some((term) => part.toLowerCase().includes(term.toLowerCase()))) kept.push(part);
  }
  return parts.filter((part, index) => kept.includes(part) && parts.indexOf(part) === index).slice(0, 6);
}

/** Links an agent must not open as instructions: exploit databases and PoC or exploit repositories. */
export function looksLikeExploit(ref: Reference): boolean {
  if (ref.tags.some((tag) => /^(exploit|evidence)$/i.test(tag))) return true;
  let url: URL;
  try {
    url = new URL(ref.url);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (/(^|\.)(packetstormsecurity\.(com|org)|exploit-db\.com|0day\.today)$/.test(host)) return true;
  if (/(^|\.)(github\.com|gitlab\.com)$/.test(host)) return /cve-\d{4}-\d{4,}|(^|[^a-z])(poc|exploits?|metasploit)([^a-z]|$)/i.test(url.pathname);
  return false;
}

// "vendor-advisory" means an advisory from any vendor (Cisco, Debian), so the product vendor's own domain ranks above it.
function rank(ref: Reference, vendorDomain?: string): number {
  const host = (() => {
    try {
      return new URL(ref.url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (vendorDomain && (host === vendorDomain || host.endsWith(`.${vendorDomain}`))) return 0;
  if (ref.tags.includes("vendor-advisory")) return 1;
  if (ref.cna) return 2;
  if (ref.tags.some((tag) => /^(patch|fix|advisory|release-notes|mitigation)$/.test(tag))) return 3;
  return 4;
}

/** HTTPS references, deduplicated, vendor and CNA links first, with exploit links counted but not listed. */
export function pickReferences(
  refs: Reference[],
  skip: string[],
  { limit = 12, vendorDomain }: { limit?: number; vendorDomain?: string } = {},
): { picked: Reference[]; exploits: number; more: number } {
  const keyOf = (value: string) => {
    try {
      const url = new URL(value);
      return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}`;
    } catch {
      return null;
    }
  };
  const skipped = new Set(skip.map(keyOf));
  const merged = new Map<string, Reference>();
  for (const ref of refs) {
    const key = keyOf(ref.url);
    if (!key || skipped.has(key) || !ref.url.startsWith("https://")) continue;
    // OSV's WEB type says nothing about the link, so it is not worth a label.
    const tags = ref.tags.map((tag) => tag.toLowerCase()).filter((tag) => tag !== "web" && /^[a-z0-9-]{1,30}$/.test(tag));
    const existing = merged.get(key);
    if (existing) {
      existing.tags = [...new Set([...existing.tags, ...tags])];
      existing.cna ||= ref.cna;
    } else merged.set(key, { url: ref.url, tags, cna: ref.cna });
  }
  const all = [...merged.values()];
  const safe = all.filter((ref) => !looksLikeExploit(ref)).sort((a, b) => rank(a, vendorDomain) - rank(b, vendorDomain));
  return { picked: safe.slice(0, limit), exploits: all.length - safe.length, more: Math.max(0, safe.length - limit) };
}

const LINKED = /^(GHSA|PYSEC|GO|RUSTSEC|BIT)-[a-zA-Z0-9-]+$/;

/**
 * OSV aliases worth following, ecosystem advisories first: they carry the package names and release
 * versions a repository actually pins. Bitnami (BIT-) records cover container images and Helm charts.
 */
export function linkedAliases(cve: string, ids: string[]): string[] {
  const priority = (id: string) => (id.startsWith("BIT-") ? 1 : 0);
  return [...new Set(ids)]
    .filter((id) => id !== cve && LINKED.test(id))
    .sort((a, b) => priority(a) - priority(b))
    .slice(0, 5);
}

/** OSV's 404 for a CVE it only knows through downstream records reads "...but the following aliases were: A B C". */
export function aliasHint(body: unknown): string[] {
  const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "";
  const match = /aliases were:\s*(.+)$/i.exec(message);
  return match ? match[1].split(/[\s,]+/).filter(Boolean) : [];
}
