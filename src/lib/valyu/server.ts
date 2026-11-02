import "server-only";

import { Valyu } from "valyu-js";

let client: Valyu | null = null;

/** Server-side Valyu client using the deployment's own key. Null when no key is configured. */
export function valyuServer(): Valyu | null {
  const key = process.env.VALYU_API_KEY;
  if (!key) return null;
  if (!client) client = new Valyu(key, undefined, { timeout: 120_000 });
  return client;
}

export function hasValyuKey(): boolean {
  return Boolean(process.env.VALYU_API_KEY);
}

export const INCIDENT_SECTORS = [
  "government",
  "healthcare",
  "finance",
  "education",
  "retail",
  "technology",
  "telecom",
  "energy",
  "manufacturing",
  "transport",
  "media",
  "legal",
  "hospitality",
  "food",
  "nonprofit",
  "defense",
  "other",
] as const;

const INCIDENT_TYPES = ["ransomware", "data_breach", "cyberattack", "ddos", "supply_chain", "espionage", "extortion", "defacement", "other"];

const STATUSES = ["confirmed_by_victim", "confirmed_by_regulator", "reported_unconfirmed", "claimed_by_attacker", "precautionary", "disputed"];

const incidentFields = {
  victim: {
    type: "string",
    description: "Affected organisation, in English or Latin script as commonly written, e.g. 'Pizza Hut Japan'. Empty if none or many.",
  },
  victim_domain: { type: "string", description: "Victim's main website domain, e.g. pizzahut.jp. Empty if unknown." },
  sector: { type: "string", enum: [...INCIDENT_SECTORS] },
  incident_type: { type: "string", enum: INCIDENT_TYPES },
  status: { type: "string", enum: STATUSES },
  threat_actor: { type: "string", description: "Named group or actor, empty if unknown." },
  records_affected: { type: "integer", description: "People or records the victim or a regulator confirmed. 0 if not stated." },
  records_claimed: { type: "integer", description: "People or records the attacker claims. 0 if not stated." },
  cve_ids: { type: "array", items: { type: "string" }, description: "CVE IDs the source links to this incident." },
  country_code: { type: "string", description: "ISO 3166-1 alpha-2 code where the victim is based or the affected site is." },
  city: { type: "string", description: "City of the victim's headquarters or the affected site. Never the article's dateline. Empty if unknown." },
  headline: { type: "string", description: "Neutral 6-14 word headline. For attacker claims write '<actor> claims ...'." },
  summary: { type: "string", description: "Two factual sentences: what happened and what is confirmed. No speculation." },
  incident_date: {
    type: "string",
    description:
      "YYYY-MM-DD the incident first became public: when the victim, a regulator or the attacker first disclosed it. For follow-up coverage this is the original disclosure, not the article's date. Empty if neither stated nor clearly implied.",
  },
};

/** Per-article extraction schema for Valyu contents (summary = JSON schema). */
export const ARTICLE_SCHEMA = {
  type: "object",
  properties: {
    is_incident: {
      type: "boolean",
      description:
        "True only if the article reports a specific cyber incident (breach, ransomware, cyberattack, DDoS, supply-chain compromise, data leak or leak-site claim) affecting one named organisation. False for advisories, vulnerabilities, statistics, opinion, or campaigns with many victims.",
    },
    ...incidentFields,
    is_follow_up: {
      type: "boolean",
      description:
        "True if the article is follow-up coverage (lawsuit, fine, settlement, investigation update, revised victim count, retrospective, anniversary) of an incident that first became public more than 30 days before the article. False for first reports and newly disclosed incidents, even when the intrusion itself began earlier.",
    },
    city_in_body: {
      type: "boolean",
      description: "True only if the city appears in the article body as the victim's location, not just in the dateline.",
    },
  },
  required: ["is_incident", "is_follow_up", "victim", "incident_type", "status", "country_code", "city", "headline", "summary"],
};

/** DeepResearch sweep schema: a list of incidents with sources. */
export const SWEEP_SCHEMA = {
  type: "object",
  properties: {
    incidents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...incidentFields,
          location_basis: { type: "string", enum: ["stated_in_source", "hq_known", "country_only"] },
          source_urls: { type: "array", items: { type: "string" }, description: "1-3 primary sources (victim, regulator, filing, reputable outlet)." },
        },
        required: ["victim", "incident_type", "status", "country_code", "city", "headline", "summary", "source_urls"],
      },
    },
  },
  required: ["incidents"],
};

/** DeepResearch daily brief schema: everything that broke, ranked and tiered. */
export const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short title, e.g. 'Daily brief: 23 Oct 2026'." },
    summary: { type: "string", description: "Three sentences on the state of play, plain English, no hype." },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tier: { type: "string", enum: ["critical", "high", "watch"] },
          headline: { type: "string", description: "One line, specific, names the product, CVE or victim." },
          detail: { type: "string", description: "One or two sentences with the key fact and the date." },
          action: { type: "string", description: "What a defender should do today, one sentence. Empty if nothing." },
          url: { type: "string", description: "The best primary source URL." },
        },
        required: ["tier", "headline", "detail", "action", "url"],
      },
    },
  },
  required: ["title", "summary", "items"],
};

// Prefixes that tag the scheduled research tasks so the app can find the latest one. They predate the
// name; changing them would orphan every task already run.
export const SWEEP_MARKER = "SITREP_SWEEP";
export const BRIEF_MARKER = "SITREP_DAILY_BRIEF";

export function sweepQuery(start: string, end: string, stamp: string): string {
  return `${SWEEP_MARKER} ${stamp}. List every publicly reported cyber incident that affected a named organisation anywhere in the world and was disclosed between ${start} and ${end}: data breaches, ransomware attacks, cyberattacks that disrupted operations, DDoS attacks, supply-chain compromises and ransomware leak-site claims.

Aim for 30 to 40 distinct incidents across as many countries and sectors as possible, including non-English reporting (Japan, Korea, India, Brazil, Germany, France, Italy, Spain, Australia and others).

Rules:
- One entry per victim organisation. Merge duplicate reports.
- city is the victim's headquarters or the affected site. Never use the article dateline as the city.
- If only an attacker or leak site claims it, status is claimed_by_attacker and the headline says "<actor> claims".
- Prefer victim statements, regulator notices, SEC filings and reputable outlets as sources. Do not use AI-written summaries on aggregator sites as sources.
- Exclude advisories, vulnerability disclosures without a named victim, statistics and opinion pieces.`;
}

export function briefQuery(date: string): string {
  return `${BRIEF_MARKER} ${date}. Write today's cyber situation report: everything that broke in the last 48 hours that a defender or an ordinary person should know about.

Cover actively exploited vulnerabilities (with CVE IDs and whether they are in CISA KEV), major breaches and ransomware attacks on named organisations, supply-chain compromises (malicious packages, backdoored releases), and large outages caused by attacks. Rank by real-world impact. Put 4 to 7 items in "critical", 5 to 8 in "high" and up to 6 in "watch".

Be precise and sober. Never call a leak-site claim a confirmed breach. Never say something is exploited in the wild unless a vendor, CISA or a reputable researcher says so. Each item names the product, CVE or victim and gives one concrete action where there is one.`;
}
