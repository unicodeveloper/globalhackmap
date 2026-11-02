import { guidanceFor } from "@/lib/guidance";
import { clean, exploitLine, hostOf, longDate, placeText, plural, productLabel, statusLine, truncate, utcTime } from "@/lib/og/copy";
import { withKev } from "@/lib/og/kev";
import type { MarkKind } from "@/lib/og/map";
import { newestFirst, withinDays } from "@/lib/og/select";
import { SITE_URL } from "@/lib/site";
import type { BriefItem, Incident, Snapshot, Vuln } from "@/lib/types";

const DAY = 86_400_000;
/** A brief older than this no longer describes "the last 48 hours", so the page builds one from live data instead. */
const BRIEF_MAX_AGE = 2 * DAY;
const THREAD_ITEMS = 10;
const POST_LIMIT = 270;

export interface DigestLink {
  label: string;
  href: string;
  mono?: boolean;
}

export interface DigestItem {
  n: number;
  headline: string;
  detail: string;
  action?: string;
  source?: { label: string; url: string };
  links: DigestLink[];
  mark?: MarkKind;
}

export interface DigestGroup {
  id: string;
  title: string;
  items: DigestItem[];
}

export interface Digest {
  date: string;
  mode: "brief" | "computed";
  /** When the items were compiled. */
  compiledAt: string;
  sources?: number;
  reportUrl?: string;
  summary: string;
  overview?: string;
  groups: DigestGroup[];
  incidents: Incident[];
  /** null when the feed behind a count failed on this refresh: unknown, not zero. */
  counts: {
    incidents: number;
    confirmed: number;
    reported: number;
    claimed: number;
    countries: number;
    kevAdded: number | null;
    newsVulns: number;
    malware: number | null;
    outages: number | null;
  };
  thread: string[];
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?:]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function countsFor(snapshot: Snapshot, kev: Map<string, Vuln> | null, now: number): Digest["counts"] {
  const answered = (feed: string) => snapshot.feeds?.[feed]?.ok !== false;
  const incidents = withinDays(snapshot.incidents, 2, now);
  const today = new Date(now).toISOString().slice(0, 10);
  const yesterday = new Date(now - DAY).toISOString().slice(0, 10);
  return {
    incidents: incidents.length,
    confirmed: incidents.filter((incident) => incident.status === "confirmed").length,
    reported: incidents.filter((incident) => incident.status === "reported" || incident.status === "precautionary").length,
    claimed: incidents.filter((incident) => incident.status === "claimed").length,
    countries: new Set(incidents.map((incident) => incident.country)).size,
    kevAdded: kev ? [...kev.values()].filter((vuln) => vuln.kevAdded === today || vuln.kevAdded === yesterday).length : null,
    newsVulns: snapshot.trending.filter((vuln) => !vuln.kev && vuln.newsCount).length,
    malware: answered("GitHub malware") ? snapshot.malware.filter((item) => now - Date.parse(item.published) < 2 * DAY).length : null,
    outages: answered("IODA outages") ? snapshot.outages.filter((outage) => !outage.end).length : null,
  };
}

/** "a", "a and b", "a, b, and c" */
function list(parts: string[]): string {
  if (parts.length < 3) return parts.join(" and ");
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function summaryFor(counts: Digest["counts"]): string {
  const hit = counts.incidents
    ? `In the last 48 hours, ${plural(counts.incidents, "organisation")} ${counts.incidents === 1 ? "was" : "were"} reported hit across ${plural(counts.countries, "country", "countries")}: ${counts.confirmed} confirmed by the victim or a regulator, ${counts.reported} reported by the press, and ${counts.claimed} only claimed by ransomware gangs.`
    : "No organisations were reported hit in the last 48 hours.";
  const rest: string[] = [];
  if (counts.kevAdded !== null) {
    rest.push(
      counts.kevAdded
        ? `CISA added ${plural(counts.kevAdded, "vulnerability", "vulnerabilities")} to its list of flaws exploited in the wild`
        : "CISA added nothing new to its list of flaws exploited in the wild",
    );
  }
  if (counts.newsVulns) {
    const noun = counts.kevAdded !== null ? ["other vulnerability", "other vulnerabilities"] : ["vulnerability", "vulnerabilities"];
    rest.push(`${plural(counts.newsVulns, noun[0], noun[1])} made the news`);
  }
  if (counts.malware !== null)
    rest.push(`${plural(counts.malware, "malicious package")} ${counts.malware === 1 ? "was" : "were"} published to open-source registries`);
  const second = rest.length ? ` ${list(rest)}.` : "";
  const outages = counts.outages ? ` ${plural(counts.outages, "country", "countries")} had a connectivity drop still in progress.` : "";
  return `${hit}${second}${outages}`;
}

/** The report's opening, cut to whole sentences: the numbered items carry the detail. */
function briefOverview(summary: string): string | undefined {
  const first = summary.split(/\n\s*\n/)[0] ?? "";
  const text = clean(first.replace(/^Global Hack Map:[^.]*\.\s*/, ""));
  // A boundary is end punctuation, a space, then a capital, so "LiteLLM 1.107.0" stays whole.
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z"(])/);
  let out = "";
  for (const sentence of sentences) {
    if (out && out.length + sentence.length > 420) break;
    out = out ? `${out} ${sentence}` : sentence;
  }
  return out.length > 40 ? out : undefined;
}

/** Internal links for a free-text brief item: CVEs it names and organisations on the map. */
function linksFor(item: BriefItem, incidents: Incident[]): DigestLink[] {
  const text = `${item.headline} ${item.detail}`;
  const cves = [...new Set(text.match(/CVE-\d{4}-\d{4,7}/g) ?? [])].slice(0, 3);
  const victims = incidents
    .filter((incident) => incident.victim.length >= 4)
    .filter((incident) => new RegExp(`\\b${incident.victim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(item.headline))
    .slice(0, 2);
  return [
    ...victims.map((incident) => ({ label: incident.victim, href: `/incident/${incident.id}` })),
    ...cves.map((cve) => ({ label: cve, href: `/cve/${cve}`, mono: true })),
  ];
}

function fromBrief(snapshot: Snapshot): DigestGroup[] {
  const brief = snapshot.brief!;
  const tiers: { id: BriefItem["tier"]; title: string }[] = [
    { id: "critical", title: "Critical" },
    { id: "high", title: "High" },
    { id: "watch", title: "Watch" },
  ];
  const ordered = [...brief.items].sort((a, b) => a.rank - b.rank);
  return tiers
    .map((tier) => ({
      id: tier.id,
      title: tier.title,
      items: ordered
        .filter((item) => item.tier === tier.id)
        .map((item) => ({
          n: 0,
          headline: clean(item.headline),
          detail: clean(item.detail),
          action: item.action ? clean(item.action) : undefined,
          source: item.url ? { label: hostOf(item.url), url: item.url } : undefined,
          links: linksFor(item, snapshot.incidents),
        })),
    }))
    .filter((group) => group.items.length);
}

function computed(snapshot: Snapshot, kev: Map<string, Vuln> | null, now: number): DigestGroup[] {
  const recent = withinDays(snapshot.incidents, 2, now);
  const incidents = recent
    .filter((incident) => incident.status === "confirmed" || incident.status === "reported")
    .sort((a, b) => b.severity - a.severity || b.date.localeCompare(a.date))
    .slice(0, 8);
  const vulns = snapshot.trending
    .map((vuln) => withKev(vuln, kev))
    .filter((vuln) => vuln.kev || vuln.newsCount)
    .slice(0, 6);
  const malware = [...snapshot.malware].sort((a, b) => b.published.localeCompare(a.published)).slice(0, 5);
  const outages = snapshot.outages.filter((outage) => !outage.end);

  const groups: DigestGroup[] = [
    {
      id: "incidents",
      title: "Organisations hit",
      items: incidents.map((incident) => {
        const source = incident.sources[0];
        const place = placeText(incident);
        return {
          n: 0,
          headline: `${incident.victim}: ${statusLine(incident).replace(/^./, (c) => c.toLowerCase())}`,
          detail: truncate(clean(`${sentence(incident.title)} ${place}, ${longDate(incident.date)}.`), 260),
          action: guidanceFor(incident).people[0],
          source: source ? { label: source.publisher || hostOf(source.url), url: source.url } : undefined,
          links: [
            { label: "Full dossier", href: `/incident/${incident.id}` },
            { label: "On the map", href: `/?i=${encodeURIComponent(incident.id)}` },
          ],
          mark: incident.status,
        };
      }),
    },
    {
      id: "vulns",
      title: "Exploited and in the news",
      items: vulns.map((vuln) => {
        const product = productLabel(vuln);
        return {
          n: 0,
          headline: `${vuln.cve}${product ? ` in ${product}` : ""}: ${exploitLine(vuln, kev !== null).replace(/^./, (c) => c.toLowerCase())}`,
          detail: truncate(clean(vuln.description || vuln.name), 260),
          action: vuln.kevDue
            ? `US federal agencies must fix it by ${longDate(`${vuln.kevDue}T00:00:00Z`)}. If you run it, patch it now.`
            : "If you run it, update to a fixed version. Your coding agent can check your code for you.",
          source: vuln.references[0] ? { label: hostOf(vuln.references[0]), url: vuln.references[0] } : undefined,
          links: [{ label: vuln.cve, href: `/cve/${vuln.cve}`, mono: true }],
          mark: vuln.kev ? "confirmed" : "reported",
        } satisfies DigestItem;
      }),
    },
    {
      id: "malware",
      title: "Malicious packages",
      items: malware.map((item) => ({
        n: 0,
        headline: `Malicious ${item.ecosystem === "pip" ? "PyPI" : item.ecosystem} package: ${item.name}`,
        detail: `${clean(item.summary)}. Published ${longDate(item.published)}.`,
        action: "If it is in a lockfile, treat that machine as compromised and rotate its secrets.",
        source: { label: "GitHub advisory", url: item.url },
        links: [],
      })),
    },
    {
      id: "outages",
      title: "Connectivity drops",
      items: outages.map((outage) => ({
        n: 0,
        headline: outage.title,
        detail: `Measured by IODA from ${longDate(outage.start)}, ${utcTime(outage.start)}, and still in progress. The cause is not known unless a source says so.`,
        source: outage.url ? { label: "IODA", url: outage.url } : undefined,
        links: [],
        mark: "outage" as const,
      })),
    },
  ];
  return groups.filter((group) => group.items.length);
}

function fitPost(prefix: string, body: string): string {
  return `${prefix}${truncate(clean(body), POST_LIMIT - prefix.length)}`;
}

function threadFor(digest: Omit<Digest, "thread">): string[] {
  const { counts } = digest;
  const items = digest.groups.flatMap((group) => group.items).slice(0, THREAD_ITEMS);
  const parts = [
    `${plural(counts.incidents, "organisation")} hit (${counts.confirmed} confirmed, ${counts.claimed} only claimed)`,
    counts.kevAdded ? plural(counts.kevAdded, "newly exploited flaw") : plural(counts.newsVulns, "vulnerability in the news", "vulnerabilities in the news"),
    counts.malware !== null ? plural(counts.malware, "malicious package") : null,
  ].filter((part): part is string => Boolean(part));
  const intro = `What broke in the last 48 hours, ${longDate(digest.date)}: ${list(parts)}. A thread:`;
  const total = items.length + 2;
  const posts = [fitPost(`1/${total} `, intro)];
  items.forEach((item, index) => {
    const body = `${sentence(item.headline)} ${item.action ?? item.detail}`;
    posts.push(fitPost(`${index + 2}/${total} `, body));
  });
  posts.push(fitPost(`${total}/${total} `, `Live map, sources and one-click fixes for all of it: ${SITE_URL}/brief`));
  return posts;
}

/** `kev` is the full CISA catalogue from kevIndex(), or null when CISA did not answer. */
export function buildDigest(snapshot: Snapshot, kev: Map<string, Vuln> | null, now = Date.now()): Digest {
  const counts = countsFor(snapshot, kev, now);
  const brief = snapshot.brief;
  const useBrief = Boolean(brief && brief.items.length && now - Date.parse(brief.date) < BRIEF_MAX_AGE);
  const groups = useBrief ? fromBrief(snapshot) : computed(snapshot, kev, now);
  let n = 0;
  for (const group of groups) for (const item of group.items) item.n = ++n;
  const base: Omit<Digest, "thread"> = {
    date: useBrief ? brief!.date : snapshot.generatedAt,
    mode: useBrief ? "brief" : "computed",
    compiledAt: useBrief ? brief!.date : snapshot.generatedAt,
    sources: useBrief ? brief!.sources : undefined,
    reportUrl: useBrief ? brief!.shareUrl : undefined,
    summary: summaryFor(counts),
    overview: useBrief ? briefOverview(brief!.summary) : undefined,
    groups,
    incidents: newestFirst(withinDays(snapshot.incidents, 2, now)),
    counts,
  };
  return { ...base, thread: threadFor(base) };
}
