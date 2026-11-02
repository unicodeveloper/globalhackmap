/** OSV ecosystem names. */
export type Ecosystem = "npm" | "PyPI" | "Go" | "RubyGems" | "Packagist" | "crates.io" | "Maven";

export type StackFormat =
  | "package.json"
  | "package-lock.json"
  | "pnpm-lock.yaml"
  | "yarn.lock"
  | "requirements.txt"
  | "poetry.lock"
  | "uv.lock"
  | "pyproject.toml"
  | "go.mod"
  | "go.sum"
  | "Gemfile.lock"
  | "composer.json"
  | "composer.lock"
  | "Cargo.toml"
  | "Cargo.lock"
  | "pom.xml"
  | "build.gradle"
  | "products"
  | "empty";

export interface StackPackage {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  /** The version came from a range (package.json "^4.17.15"), so the base version stands in for the installed one. */
  ranged?: boolean;
  /** Listed directly by the project rather than pulled in by another package, when the format says so. */
  direct?: boolean;
}

export interface StackProduct {
  name: string;
  version?: string;
}

export interface ParsedStack {
  format: StackFormat;
  packages: StackPackage[];
  products: StackProduct[];
  /** Packages found before the cap was applied. */
  total: number;
  truncated: boolean;
  ranged: boolean;
  /** Entries we could not check because they had no usable version (tags, git URLs, bare names). */
  skipped: number;
}

export type Severity = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

/** 0 malicious, 1 exploited (CISA KEV), 2 likely exploited (high EPSS), 3 critical, 4 everything else. */
export type FindingTier = 0 | 1 | 2 | 3 | 4;

export interface KevFact {
  cve: string;
  name: string;
  added: string;
  due?: string;
  ransomware: boolean;
}

export interface PackageFinding {
  /** Primary advisory ID (MAL-, GHSA-, PYSEC-, GO-, RUSTSEC-...). */
  id: string;
  kind: "malicious" | "vulnerability";
  tier: FindingTier;
  ecosystem: Ecosystem;
  package: string;
  version: string;
  ranged: boolean;
  /** First version that fixes this advisory for the installed release line, when OSV lists one. */
  fixed?: string;
  summary: string;
  /** Every advisory ID that describes this issue. */
  aliases: string[];
  cves: string[];
  severity?: Severity;
  cvss?: number;
  kev?: KevFact;
  epss?: { score: number; percentile: number };
  published?: string;
  url: string;
}

export interface ProductMatch {
  cve: string;
  vendor: string;
  product: string;
  name: string;
  /** In CISA KEV. False means it is only in the news. */
  kev: boolean;
  added?: string;
  due?: string;
  ransomware: boolean;
  epss?: number;
  advisory?: string;
}

export interface ProductFinding {
  name: string;
  version?: string;
  /** Total KEV entries that matched, before trimming the list. */
  kevTotal: number;
  /** Most recent KEV matches first, trimmed. */
  matches: ProductMatch[];
  /** Vulnerabilities in the news this week for this product that are not in KEV. */
  news: ProductMatch[];
}

export interface UnexpandedAdvisories {
  ecosystem: Ecosystem;
  package: string;
  version: string;
  ids: string[];
}

export interface StackReport {
  format: StackFormat;
  checkedAt: string;
  counts: {
    packages: number;
    products: number;
    /** Distinct packages with at least one known issue. */
    vulnerablePackages: number;
    malicious: number;
    exploited: number;
    likely: number;
    critical: number;
    /** Every distinct known issue, all tiers. */
    known: number;
    /** Products with at least one KEV match. */
    productsExploited: number;
  };
  ranged: boolean;
  truncated: boolean;
  /** Packages parsed before the cap. */
  totalParsed: number;
  /** All package findings, ranked: malicious, exploited, likely, critical, the rest. */
  findings: PackageFinding[];
  products: ProductFinding[];
  /** Advisory IDs we did not expand because of the per-check detail cap. */
  unexpanded: UnexpandedAdvisories[];
  /** Names worth monitoring daily: affected packages first, then direct dependencies, then products. */
  watchlist: string[];
  /** Which upstream sources answered. A false here means the verdict is incomplete. */
  sources: { osv: boolean; kev: boolean; epss: boolean };
  /** Honest notes about anything that limited the check. */
  notes: string[];
}

export const MAX_PACKAGES = 1000;
export const MAX_INPUT_BYTES = 500_000;
