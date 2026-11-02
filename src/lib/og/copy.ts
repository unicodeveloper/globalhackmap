import { countryCentroid, countryName } from "@/lib/countries";
import { epssPercent, recordsLabel } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import type { Incident, IncidentType, Vuln } from "@/lib/types";

// Wording shared by the share cards, the indexable pages and the RSS feed, so every surface says the same honest thing.

export const TYPE_NOUN: Record<IncidentType, string> = {
  ransomware: "ransomware attack",
  data_breach: "data breach",
  cyberattack: "cyberattack",
  ddos: "DDoS attack",
  supply_chain: "supply chain attack",
  espionage: "espionage campaign",
  extortion: "extortion attempt",
  defacement: "website defacement",
  other: "security incident",
};

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "22 Oct 2026" */
export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Friday 23 October 2026" */
export function fullDate(iso: string, withYear = true): string {
  const date = new Date(iso);
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-GB", { ...options, timeZone: "UTC" });
  return [part({ weekday: "long" }), part({ day: "numeric" }), part({ month: "long" }), withYear ? part({ year: "numeric" }) : ""].filter(Boolean).join(" ");
}

/** "12:09 UTC" */
export function utcTime(iso: string): string {
  return `${new Date(iso).toISOString().slice(11, 16)} UTC`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

/** Third-party text can carry em dashes; the house style never does. */
export function clean(text: string): string {
  return text
    .replace(/\s*\u2014\s*/g, " - ")
    .replace(/\s*\[\[\d+\]\]/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

export function hostLabel(): string {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return "globalhackmap";
  }
}

/** Short status for cards, titles and the feed: "Confirmed data breach", "Claimed by Qilin, not confirmed". */
export function statusLine(incident: Pick<Incident, "status" | "type" | "actor">): string {
  const noun = TYPE_NOUN[incident.type];
  switch (incident.status) {
    case "confirmed":
      return `Confirmed ${noun}`;
    case "reported":
      return `Reported ${noun}, not yet confirmed`;
    case "claimed":
      return incident.actor ? `Claimed by ${incident.actor}, not confirmed` : "Claimed on a leak site, not confirmed";
    case "precautionary":
      return "Systems taken offline as a precaution";
    case "disputed":
      return `Reported ${noun}, disputed by the organisation`;
  }
}

/** The dossier's longer status sentence. */
export function statusSentence(incident: Pick<Incident, "status" | "date" | "actor">): string {
  const when = longDate(incident.date);
  switch (incident.status) {
    case "confirmed":
      return `Confirmed by the organisation, a regulator or a securities filing. First reported ${when}.`;
    case "reported":
      return `Reported by the press on ${when}. The organisation has not confirmed it yet.`;
    case "claimed":
      return `${incident.actor ? `${incident.actor} claimed it` : "Claimed"} on a ransomware leak site on ${when}. Not confirmed by the organisation, so treat it as a claim, not a fact.`;
    case "precautionary":
      return `Systems taken offline as a precaution on ${when}. No compromise has been stated.`;
    case "disputed":
      return `Reported on ${when}, and disputed by the organisation.`;
  }
}

/** Only a confirmed incident has confirmed records; anything else is a reported or claimed count. */
export const recordsText = recordsLabel;

const SHORT_NAME: Record<string, string> = { US: "United States" };
const WITH_THE = new Set(["US", "GB", "NL", "AE", "PH", "DO", "BS", "GM", "MV", "CF", "KY", "FO", "MH", "SB", "TC", "VI", "VG", "CK", "KM", "CD", "CG"]);

export function countryLabel(code: string): string {
  return SHORT_NAME[code] ?? countryName(code);
}

/** "the United States", "Japan" */
export function countryPhrase(code: string): string {
  return `${WITH_THE.has(code) ? "the " : ""}${countryLabel(code)}`;
}

/** [lon, lat] */
export function countryPoint(code: string): [number, number] | null {
  return countryCentroid(code);
}

export function placeText(incident: Pick<Incident, "city" | "country">): string {
  const country = countryLabel(incident.country);
  return incident.city && incident.city !== country ? `${incident.city}, ${country}` : country;
}

export function incidentTitle(incident: Incident): string {
  if (incident.status === "claimed") {
    const claim = incident.type === "ransomware" ? "ransomware claim" : "leak-site claim";
    return `${incident.victim} ${claim}${incident.actor ? ` by ${incident.actor}` : ""}: what we know and what to do`;
  }
  return `${incident.victim} ${TYPE_NOUN[incident.type]}: what happened and what to do`;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.:;-]+$/, "")}…`;
}

export function incidentDescription(incident: Incident): string {
  const lead = clean(incident.summary || incident.title);
  return truncate(`${statusLine(incident)}. ${lead}`, 200);
}

// NVD's CPE names arrive as "Php" or "Gitlab"; show the names people actually search for.
const CASING: Record<string, string> = {
  php: "PHP",
  gitlab: "GitLab",
  github: "GitHub",
  wordpress: "WordPress",
  openssl: "OpenSSL",
  openssh: "OpenSSH",
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  vmware: "VMware",
  jquery: "jQuery",
  "node.js": "Node.js",
  nodejs: "Node.js",
  "pan-os": "PAN-OS",
  fortios: "FortiOS",
  macos: "macOS",
  ios: "iOS",
  ipados: "iPadOS",
};

function cased(name: string): string {
  return name
    .split(" ")
    .map((word) => CASING[word.toLowerCase()] ?? word)
    .join(" ");
}

export function productLabel(vuln: Pick<Vuln, "vendor" | "product">): string {
  const vendor = cased(vuln.vendor.trim());
  const product = cased(vuln.product.trim());
  if (!vendor) return product;
  if (!product) return vendor;
  // "PHP Group" + "PHP" and "Php" + "Php" both read as the product alone.
  if (product.toLowerCase().startsWith(vendor.toLowerCase())) return product;
  if (vendor.toLowerCase().split(" ")[0] === product.toLowerCase().split(" ")[0]) return product;
  return `${vendor} ${product}`;
}

/** Prose form of epssPercent, so every surface shows the same number. */
export function epssText(epss: number): string {
  if (epss >= 0.9995) return "over 99.9%";
  return epssPercent(epss);
}

export type ExploitTone = "exploited" | "news" | "none" | "unknown";

/** `kevKnown` is false when CISA's catalogue could not be read: then absence from it proves nothing. */
export function exploitTone(vuln: Pick<Vuln, "kev" | "newsCount">, kevKnown = true): ExploitTone {
  if (vuln.kev) return "exploited";
  if (vuln.newsCount) return "news";
  return kevKnown ? "none" : "unknown";
}

export function exploitLine(vuln: Pick<Vuln, "kev" | "kevAdded" | "newsCount">, kevKnown = true): string {
  if (vuln.kev)
    return vuln.kevAdded ? `Exploited in the wild, on CISA's list since ${longDate(`${vuln.kevAdded}T00:00:00Z`)}` : "Exploited in the wild, per CISA";
  if (vuln.newsCount) return kevKnown ? "In the news, not on CISA's exploited list yet" : "In the news";
  return kevKnown ? "No known exploitation yet" : "Exploitation status unavailable right now";
}

export function cveTitle(vuln: Vuln): string {
  const product = productLabel(vuln);
  return `${vuln.cve}: ${product ? `${product} exploited?` : "Exploited?"} Affected versions and fix`;
}

export function cveDescription(vuln: Vuln, kevKnown = true): string {
  const parts = [
    vuln.kev
      ? `Yes: CISA lists ${vuln.cve} as exploited in the wild${vuln.kevAdded ? ` since ${longDate(`${vuln.kevAdded}T00:00:00Z`)}` : ""}.`
      : kevKnown
        ? `${vuln.cve} is not on CISA's exploited list yet.`
        : null,
    vuln.epss !== undefined ? `${epssText(vuln.epss)} chance of exploitation in the next 30 days (EPSS).` : null,
    vuln.cvss ? `CVSS ${vuln.cvss.toFixed(1)}.` : null,
    clean(vuln.description || vuln.name),
  ].filter(Boolean);
  return truncate(parts.join(" "), 200);
}
