import "server-only";

import { type Fetched, beforeDeadline, settle, unwrap } from "@/lib/fetched";

import { cacheLife } from "next/cache";

import { withLastGood } from "@/lib/sources/last-good";
import type { IncidentStatus, IncidentType, Incident, SourceRef } from "@/lib/types";
import { ARTICLE_SCHEMA, SWEEP_MARKER, SWEEP_SCHEMA, sweepQuery, valyuServer } from "@/lib/valyu/server";

const UA = "GlobalHackMap/1.0 (+https://github.com/yorkeccak/globalhackmap)";

/** A raw incident report from one source, before geocoding and dedupe. */
export interface Candidate {
  victim: string;
  domain?: string;
  sector?: string;
  type: IncidentType;
  status: IncidentStatus;
  actor?: string;
  records?: number;
  recordsClaimed?: number;
  cves: string[];
  country?: string;
  city?: string;
  /** Whether the city is stated in the source as the victim's location (not a dateline). */
  cityStated?: boolean;
  /** "Secaucus, NJ" style location from a filing. */
  usLocation?: string;
  headline: string;
  summary: string;
  date: string;
  sources: SourceRef[];
  origin: Incident["origin"];
  /** Text of the article, used for the dateline guard. Not stored. */
  text?: string;
}

const TYPE_MAP: Record<string, IncidentType> = {
  ransomware: "ransomware",
  data_breach: "data_breach",
  cyberattack: "cyberattack",
  ddos: "ddos",
  supply_chain: "supply_chain",
  espionage: "espionage",
  extortion: "extortion",
  extortion_leak_claim: "extortion",
  defacement: "defacement",
  service_outage_from_attack: "cyberattack",
  precautionary_shutdown: "cyberattack",
};

const STATUS_MAP: Record<string, IncidentStatus> = {
  confirmed_by_victim: "confirmed",
  confirmed_by_regulator: "confirmed",
  confirmed_by_regulator_or_filing: "confirmed",
  reported_unconfirmed: "reported",
  claimed_by_attacker: "claimed",
  precautionary: "precautionary",
  disputed: "disputed",
};

function toInt(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function publisherOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cleanCves(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map(String)
        .map((v) => v.trim().toUpperCase())
        .filter((v) => /^CVE-\d{4}-\d{4,}$/.test(v)),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Ransomware leak-site claims (RansomLook, CC BY 4.0)
// ---------------------------------------------------------------------------

interface RansomLookPost {
  post_title: string;
  discovered: string;
  description?: string;
  group_name: string;
}

function titleCaseGroup(group: string): string {
  return group.replace(/(^|[\s_-])(\w)/g, (_, sep: string, ch: string) => `${sep === "_" ? " " : sep}${ch.toUpperCase()}`);
}

export async function getRansomwareClaims(): Promise<Candidate[]> {
  return unwrap(await getRansomwareClaimsFetched());
}

async function getRansomwareClaimsFetched(): Promise<Fetched<Candidate[]>> {
  "use cache";
  const result = await settle(async () => {
    const res = await fetch("https://www.ransomlook.io/api/recent", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`RansomLook ${res.status}`);
    const posts = (await res.json()) as RansomLookPost[];
    return posts
      .filter((post) => post.post_title && post.post_title.length > 2)
      .map((post) => {
        const title = post.post_title.trim();
        const isDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(title);
        const group = titleCaseGroup(post.group_name);
        const date = new Date(`${post.discovered.replace(" ", "T").slice(0, 19)}Z`).toISOString();
        const victim = isDomain ? title.toLowerCase() : title;
        return {
          victim,
          domain: isDomain ? title.toLowerCase() : undefined,
          type: "ransomware",
          status: "claimed",
          actor: group,
          cves: [],
          headline: `${group} claims ${victim}`,
          summary: `The ${group} group listed ${victim} on its leak site. The organisation has not confirmed an attack, so treat this as a claim.`,
          date,
          sources: [
            {
              title: `${group} leak-site post (via RansomLook)`,
              url: `https://www.ransomlook.io/group/${encodeURIComponent(post.group_name)}`,
              publisher: "ransomlook.io",
              date,
              kind: "leaksite",
            },
          ],
          origin: "claims",
        } satisfies Candidate;
      });
  });
  if (result.ok) cacheLife("feed");
  else cacheLife("minutes");
  return result;
}

// ---------------------------------------------------------------------------
// SEC 8-K cybersecurity disclosures (EDGAR full-text search)
// ---------------------------------------------------------------------------

interface EftsHit {
  _id: string;
  _source: {
    ciks: string[];
    display_names: string[];
    file_date: string;
    biz_locations?: string[];
    items?: string[];
    adsh: string;
  };
}

function secCompanyName(display: string): { name: string; ticker?: string } {
  const match = /^(.*?)\s+\(([^)]*)\)\s+\(CIK/.exec(display);
  const raw = (match?.[1] ?? display.split("(CIK")[0]).trim();
  const name = raw
    .toLowerCase()
    .replace(/\b(inc|corp|co|ltd|plc|llc)\b\.?/g, (m) => m.charAt(0).toUpperCase() + m.slice(1))
    .replace(/(^|\s|-|&)([a-z])/g, (_, s: string, c: string) => s + c.toUpperCase());
  return { name, ticker: match?.[2]?.split(",")[0]?.trim() };
}

export async function getSecDisclosures(): Promise<Candidate[]> {
  return unwrap(await getSecDisclosuresFetched());
}

async function getSecDisclosuresFetched(): Promise<Fetched<Candidate[]>> {
  "use cache";
  const result = await settle(async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86_400_000);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent('"cybersecurity incident"')}&forms=8-K&dateRange=custom&startdt=${day(start)}&enddt=${day(end)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Valyu Global Hack Map contact@valyu.ai", Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`SEC ${res.status}`);
    const json = (await res.json()) as { hits: { hits: EftsHit[] } };
    const seen = new Set<string>();
    const out: Candidate[] = [];
    for (const hit of json.hits.hits) {
      const src = hit._source;
      const items = src.items ?? [];
      // Item 1.05 is the material cybersecurity incident item. Some companies use 8.01 instead.
      if (!items.includes("1.05") && !items.includes("8.01")) continue;
      const cik = src.ciks[0]?.replace(/^0+/, "");
      if (!cik || seen.has(cik)) continue;
      seen.add(cik);
      const { name, ticker } = secCompanyName(src.display_names[0] ?? "");
      const file = hit._id.split(":")[1] ?? "";
      const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${src.adsh.replace(/-/g, "")}/${file}`;
      const date = new Date(`${src.file_date}T16:00:00Z`).toISOString();
      out.push({
        victim: name,
        type: "cyberattack",
        status: "confirmed",
        cves: [],
        usLocation: src.biz_locations?.[0],
        headline: `${name}${ticker ? ` (${ticker})` : ""} discloses a cybersecurity incident in an 8-K`,
        summary: `${name} filed a Form 8-K with the SEC on ${src.file_date} that discusses a cybersecurity incident${items.includes("1.05") ? " under Item 1.05 (material cybersecurity incidents)" : ""}. Read the filing for scope and impact.`,
        date,
        sources: [{ title: `Form 8-K, ${src.file_date}`, url: filingUrl, publisher: "sec.gov", date, kind: "filing" }],
        origin: "sec",
      });
    }
    return out;
  });
  if (result.ok) cacheLife("hours");
  else cacheLife("minutes");
  return result;
}

// ---------------------------------------------------------------------------
// News discovery (Valyu search) + per-article extraction (Valyu contents)
// ---------------------------------------------------------------------------

export const NEWS_QUERIES = [
  "data breach",
  "ransomware attack",
  "cyberattack",
  "hackers claim stolen data",
  "customer data leaked",
  "cyber incident systems offline",
  "DDoS attack",
  "unauthorized access personal information",
  "supply chain attack compromised",
  "hospital cyberattack",
  "school district cyberattack",
  "city council cyber attack",
  "bank data breach customers",
  "retailer data breach",
  "university data breach",
  "不正アクセス 情報漏えい",
  "Cyberangriff",
  "ciberataque",
  "cyberattaque",
  "attacco hacker",
];

interface Discovered {
  url: string;
  title: string;
  date?: string;
  publisher: string;
}

function canonicalUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|cmp$|ocid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.replace(/^(www|amp|m)\./, "");
    url.pathname = url.pathname.replace(/\/amp\/?$/, "/");
    return url.toString();
  } catch {
    return raw;
  }
}

const SKIP_PUBLISHERS =
  /(inkl\.com|yahoo\.com|msn\.com|news\.google\.com|ground\.news|newsbreak\.com|hookphish|ransomware\.live|redpacketsecurity|dexpose|hackmanac)/i;

/** Newest news articles about incidents, deduped by canonical URL. Refreshed every 30 minutes. */
export async function discoverNews(): Promise<Discovered[]> {
  return unwrap(await discoverNewsFetched());
}

async function discoverNewsFetched(): Promise<Fetched<Discovered[]>> {
  "use cache: remote";
  const result = await settle(async () => {
    return withLastGood("valyu-news-discovery", async () => {
      const valyu = valyuServer();
      if (!valyu) return [];
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 86_400_000);
      const day = (d: Date) => d.toISOString().slice(0, 10);
      const results = await Promise.allSettled(
        NEWS_QUERIES.map((query) =>
          valyu.search(query, {
            searchType: "news",
            maxNumResults: 10,
            startDate: day(start),
            endDate: day(end),
            responseLength: "short",
          }),
        ),
      );
      // Every query failing is an outage, not a quiet news week: throw so the feed shows as down.
      if (!results.some((result) => result.status === "fulfilled" && result.value.success)) throw new Error("Valyu news search failed");
      const seen = new Map<string, Discovered>();
      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value.success) continue;
        for (const item of result.value.results) {
          const url = canonicalUrl(item.url);
          if (seen.has(url) || SKIP_PUBLISHERS.test(url)) continue;
          seen.set(url, {
            url,
            title: item.title,
            date: item.publication_date ?? item.date,
            publisher: publisherOf(url),
          });
        }
      }
      return [...seen.values()];
    });
  });
  if (result.ok) cacheLife("hours");
  else cacheLife("minutes");
  return result;
}

interface ArticleExtraction {
  is_incident?: boolean;
  victim?: string;
  victim_domain?: string;
  sector?: string;
  incident_type?: string;
  status?: string;
  threat_actor?: string;
  records_affected?: number;
  records_claimed?: number;
  cve_ids?: string[];
  country_code?: string;
  city?: string;
  city_in_body?: boolean;
  headline?: string;
  summary?: string;
  incident_date?: string;
  is_follow_up?: boolean;
}

type Extraction = { data: ArticleExtraction; text?: string; title?: string; date?: string };

/**
 * Bump when ARTICLE_SCHEMA changes meaning, so cached extractions are read again under the new schema.
 * 2: incident_date is the original disclosure, and is_follow_up flags coverage of older incidents.
 */
const EXTRACTION_VERSION = 2;

/**
 * Structured extraction for one article, paid for once: shared by every instance and reused inside the
 * snapshot's cache. A failure is kept for minutes so the article is retried, not pinned for a week.
 * `version` keys the cache, so a schema change reads every article again.
 */
export async function extractArticle(url: string, version: number): Promise<Extraction | null> {
  "use cache: remote";
  // Only the current schema is fetched; an older version could only be a stale caller.
  if (version !== EXTRACTION_VERSION) {
    cacheLife("minutes");
    return null;
  }
  try {
    const extraction = await requestExtraction(url);
    cacheLife("paid");
    return extraction;
  } catch {
    cacheLife("minutes");
    return null;
  }
}

async function requestExtraction(url: string): Promise<Extraction> {
  const valyu = valyuServer();
  if (!valyu) throw new Error("no Valyu key");
  const res = await valyu.contents([url], { summary: ARTICLE_SCHEMA, responseLength: "medium" });
  const first = "results" in res ? res.results?.[0] : undefined;
  if (!first || first.status !== "success") throw new Error(`extraction failed for ${url}`);
  const data = typeof first.summary === "string" ? safeJson(first.summary) : (first.summary as ArticleExtraction | undefined);
  if (!data) throw new Error(`no structured summary for ${url}`);
  return {
    data,
    text: typeof first.content === "string" ? first.content.slice(0, 1500) : undefined,
    title: first.title,
    date: first.publication_date,
  };
}

function safeJson(value: string): ArticleExtraction | undefined {
  try {
    return JSON.parse(value) as ArticleExtraction;
  } catch {
    return undefined;
  }
}

function extractionToCandidate(data: ArticleExtraction, source: SourceRef, fallbackDate: string, text?: string): Candidate | null {
  // Follow-up coverage of an older incident is not a new one; dating it to the article put 2024 attacks on this week's map.
  if (!data.is_incident || data.is_follow_up || !data.victim?.trim()) return null;
  const type = TYPE_MAP[data.incident_type ?? ""] ?? "cyberattack";
  const status = STATUS_MAP[data.status ?? ""] ?? "reported";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(data.incident_date ?? "") ? new Date(`${data.incident_date}T12:00:00Z`).toISOString() : fallbackDate;
  return {
    victim: data.victim.trim(),
    domain: data.victim_domain?.trim().toLowerCase() || undefined,
    sector: data.sector,
    type,
    status,
    actor: data.threat_actor?.trim() || undefined,
    records: toInt(data.records_affected),
    recordsClaimed: toInt(data.records_claimed),
    cves: cleanCves(data.cve_ids),
    country: data.country_code?.trim().toUpperCase() || undefined,
    city: data.city?.trim() || undefined,
    cityStated: data.city_in_body !== false,
    headline: data.headline?.trim() || `${data.victim} hit by ${type.replace("_", " ")}`,
    summary: data.summary?.trim() || "",
    date,
    sources: [source],
    origin: "news",
    text,
  };
}

/** Incidents from the news pipeline. New articles per refresh are capped to bound cost. */
export async function getNewsIncidents(maxNew = 200, budgetMs = 35_000): Promise<Candidate[]> {
  // Bounded concurrency and a hard time budget: a cold cache must never block a page for minutes.
  // Articles still extracting at the deadline land on a later refresh.
  const deadline = Date.now() + budgetMs;
  const discovered = await discoverNews();
  const batch = discovered.slice(0, maxNew);
  const out: Candidate[] = [];
  for (let i = 0; i < batch.length; i += 12) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    const slice = batch.slice(i, i + 12);
    const settled = await Promise.allSettled(slice.map((item) => beforeDeadline(extractArticle(item.url, EXTRACTION_VERSION), left, null)));
    settled.forEach((result, idx) => {
      if (result.status !== "fulfilled" || !result.value) return;
      const item = slice[idx];
      const date = item.date ? new Date(item.date).toISOString() : new Date().toISOString();
      const candidate = extractionToCandidate(
        result.value.data,
        { title: result.value.title ?? item.title, url: item.url, publisher: item.publisher, date, kind: "news" },
        date,
        result.value.text,
      );
      if (candidate) out.push(candidate);
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// DeepResearch sweep: a recall net run a few times a day by the cron route
// ---------------------------------------------------------------------------

interface SweepIncident extends ArticleExtraction {
  location_basis?: string;
  source_urls?: string[];
  // Older schema field names, kept so seed sweeps still parse.
  victim_name?: string;
  country_iso2?: string;
  date_disclosed?: string;
  source_url?: string;
  victim_sector?: string;
}

export function sweepToCandidates(incidents: SweepIncident[], completedAt: string): Candidate[] {
  const out: Candidate[] = [];
  for (const item of incidents) {
    const victim = (item.victim ?? item.victim_name ?? "").trim();
    if (!victim) continue;
    const urls = (item.source_urls ?? (item.source_url ? [item.source_url] : [])).filter((u) => /^https?:\/\//.test(u));
    if (!urls.length) continue;
    const dateRaw = item.incident_date ?? item.date_disclosed;
    const date = /^\d{4}-\d{2}-\d{2}/.test(dateRaw ?? "") ? new Date(`${dateRaw!.slice(0, 10)}T12:00:00Z`).toISOString() : completedAt;
    const type = TYPE_MAP[item.incident_type ?? ""] ?? "cyberattack";
    const status = STATUS_MAP[item.status ?? ""] ?? "reported";
    const basis = item.location_basis ?? "";
    out.push({
      victim,
      domain: item.victim_domain?.toLowerCase() || undefined,
      sector: item.sector ?? item.victim_sector,
      type,
      status,
      actor: item.threat_actor?.trim() || undefined,
      records: toInt(item.records_affected),
      recordsClaimed: toInt(item.records_claimed),
      cves: cleanCves(item.cve_ids),
      country: (item.country_code ?? item.country_iso2)?.toUpperCase(),
      city: item.city?.trim() || undefined,
      cityStated: basis !== "country_only" && basis !== "unknown",
      headline:
        item.headline?.trim() ||
        (status === "claimed" && item.threat_actor ? `${item.threat_actor} claims ${victim}` : `${victim}: ${type.replace("_", " ")} reported`),
      summary: item.summary?.trim() || "",
      date,
      sources: urls.slice(0, 3).map((url) => ({ title: publisherOf(url), url, publisher: publisherOf(url), date, kind: "news" })),
      origin: "sweep",
    });
  }
  return out;
}

type SweepResult = { incidents: SweepIncident[]; completedAt: string };

/** A finished sweep never changes, so it is kept for a week; a miss is kept for minutes. */
async function getSweepResult(taskId: string): Promise<SweepResult | null> {
  "use cache: remote";
  try {
    const result = await requestSweepResult(taskId);
    cacheLife("paid");
    return result;
  } catch {
    cacheLife("minutes");
    return null;
  }
}

async function requestSweepResult(taskId: string): Promise<SweepResult> {
  const valyu = valyuServer();
  if (!valyu) throw new Error("no Valyu key");
  const status = await valyu.deepresearch.status(taskId);
  if (status.status !== "completed" || !status.output) throw new Error(`sweep ${taskId} is not complete`);
  const output = typeof status.output === "string" ? JSON.parse(status.output) : status.output;
  return { incidents: (output.incidents ?? []) as SweepIncident[], completedAt: status.completed_at ?? new Date().toISOString() };
}

/** Incidents from the latest completed sweeps (last 48 hours). */
export async function getSweepIncidents(): Promise<Candidate[]> {
  return unwrap(await getSweepIncidentsFetched());
}

async function getSweepIncidentsFetched(): Promise<Fetched<Candidate[]>> {
  "use cache";
  const result = await settle(async () => {
    return withLastGood("valyu-sweeps", async () => {
      const valyu = valyuServer();
      if (!valyu) return [];
      const list = await valyu.deepresearch.list({ limit: 50 });
      // The SDK resolves failures as { success: false } rather than throwing. Throw, so the feed shows as
      // down and the last good sweeps stay on the map instead of 200 incidents silently disappearing.
      if (!list.success || !list.data) throw new Error(list.error ?? "deepresearch.list failed");
      const cutoff = Date.now() - 30 * 86_400_000;
      const tasks = (list.data ?? [])
        .filter((task) => task.status === "completed" && task.query?.startsWith(SWEEP_MARKER))
        .filter((task) => toMillis(task.created_at) > cutoff)
        .slice(0, 12);
      const out: Candidate[] = [];
      for (const task of tasks) {
        const result = await getSweepResult(task.deepresearch_id).catch(() => null);
        if (result) out.push(...sweepToCandidates(result.incidents, result.completedAt));
      }
      return out;
    });
  });
  if (result.ok) cacheLife("feed");
  else cacheLife("minutes");
  return result;
}

function toMillis(value: number | string): number {
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  return Date.parse(value);
}

/** Start a sweep (called by the cron route). Returns the task id. */
export async function startSweep(fromDaysAgo = 3, toDaysAgo = 0): Promise<string | null> {
  const valyu = valyuServer();
  if (!valyu) return null;
  const end = new Date(Date.now() - toDaysAgo * 86_400_000);
  const start = new Date(Date.now() - fromDaysAgo * 86_400_000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const res = await valyu.deepresearch.create({
    query: sweepQuery(day(start), day(end), end.toISOString().slice(0, 13) + ":00Z"),
    mode: "fast",
    outputFormats: [SWEEP_SCHEMA],
    search: { startDate: day(start), endDate: day(end) },
    metadata: { app: "globalhackmap", kind: "sweep" },
  });
  return res.deepresearch_id ?? null;
}
