export type IncidentStatus = "confirmed" | "reported" | "claimed" | "precautionary" | "disputed";

export type IncidentType = "ransomware" | "data_breach" | "cyberattack" | "ddos" | "supply_chain" | "espionage" | "extortion" | "defacement" | "other";

export type SourceKind = "news" | "filing" | "regulator" | "victim" | "leaksite" | "research";

export interface SourceRef {
  title: string;
  url: string;
  publisher?: string;
  date?: string;
  kind?: SourceKind;
}

export type GeoBasis = "stated" | "hq" | "tld" | "country";

export interface Incident {
  id: string;
  victim: string;
  domain?: string;
  sector?: string;
  type: IncidentType;
  status: IncidentStatus;
  title: string;
  summary: string;
  actor?: string;
  records?: number;
  recordsClaimed?: number;
  cves: string[];
  country: string;
  city?: string;
  lat: number;
  lon: number;
  geoBasis: GeoBasis;
  /** ISO timestamp the incident was first reported. */
  date: string;
  /** ISO timestamp of the latest source. */
  updated: string;
  /** 1 (low) to 4 (critical). */
  severity: 1 | 2 | 3 | 4;
  /** 0 to 1, how sure we are this is real and correctly placed. */
  confidence: number;
  sources: SourceRef[];
  origin: "news" | "sweep" | "sec" | "claims" | "seed";
}

export interface Vuln {
  cve: string;
  vendor: string;
  product: string;
  name: string;
  description: string;
  /** Date added to CISA KEV, if listed. */
  kevAdded?: string;
  kevDue?: string;
  kev: boolean;
  ransomware: boolean;
  epss?: number;
  epssPercentile?: number;
  cvss?: number;
  severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  published?: string;
  /** Present when the CVE is in the news but not yet in KEV. */
  newsCount?: number;
  references: string[];
  cwe?: string;
}

/** Plain-English answer to "what can attackers do, who is affected, how do I fix it". */
export interface Explainer {
  title: string;
  who: string;
  fix: string;
}

/** One product to patch now: its CVEs grouped, most urgent lead CVE first. */
export interface PatchItem extends Explainer {
  key: string;
  vendor: string;
  product: string;
  domain?: string;
  cves: string[];
  exploited: boolean;
  ransomware: boolean;
  newsCount: number;
  kevAdded?: string;
  epss?: number;
  cvss?: number;
  /** False when the explainer is the catalogue fallback rather than a researched answer. */
  explained: boolean;
}

export interface MalwarePackage {
  id: string;
  ecosystem: string;
  name: string;
  summary: string;
  published: string;
  url: string;
}

export interface Outage {
  id: string;
  kind: "country" | "cloud";
  title: string;
  country?: string;
  provider?: string;
  region?: string;
  lat: number;
  lon: number;
  start: string;
  end?: string;
  score?: number;
  url?: string;
}

export interface BriefItem {
  rank: number;
  tier: "critical" | "high" | "watch";
  headline: string;
  detail: string;
  action?: string;
  url?: string;
}

export interface DailyBrief {
  id: string;
  date: string;
  title: string;
  summary: string;
  items: BriefItem[];
  /** Markdown body of the full report. */
  report?: string;
  shareUrl?: string;
  sources: number;
}

export interface SnapshotStats {
  incidents24h: number;
  incidents7d: number;
  confirmed7d: number;
  claimed7d: number;
  countries7d: number;
  kevAdded30d: number;
  criticalCves72h: number;
  malware72h: number;
  outagesActive: number;
}

export interface Snapshot {
  generatedAt: string;
  incidents: Incident[];
  kev: Vuln[];
  trending: Vuln[];
  /** Newest first: critical CVEs published in the last 72 hours and CVEs added to KEV in the last week. */
  fresh: Vuln[];
  malware: MalwarePackage[];
  outages: Outage[];
  stats: SnapshotStats;
  brief?: DailyBrief;
  /** Which upstream feeds answered on this refresh. */
  feeds: Record<string, { ok: boolean; count: number; note?: string }>;
}
