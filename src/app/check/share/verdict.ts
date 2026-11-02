import { longDate, plural } from "@/lib/og/copy";

/**
 * Counts from a shared result link. Never package or product names: the link carries numbers only.
 * e exploited (CISA KEV), m malicious, l likely to be exploited soon (high EPSS), c critical, n checked,
 * t=products for a product list, d the check date.
 */
export interface SharedResult {
  exploited: number;
  malicious: number;
  /** Not known to be exploited yet but likely to be soon. Same tier as "Likely soon" on the results page. */
  likely: number;
  /** Rated critical and not in a higher tier. Same as "Critical" on the results page. */
  critical: number;
  checked: number;
  products: boolean;
  date?: string;
}

/** How a shared result reads at a glance, in the same status colours as the results page. */
export type SharedLevel = "confirmed" | "reported" | "safe";

type Params = Record<string, string | string[] | undefined>;

function count(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || !/^\d{1,6}$/.test(raw)) return null;
  return Number(raw);
}

export function readShared(params: Params): SharedResult | null {
  const checked = count(params.n);
  if (!checked) return null;
  const date = Array.isArray(params.d) ? params.d[0] : params.d;
  const products = params.t === "products";
  return {
    exploited: count(params.e) ?? 0,
    malicious: count(params.m) ?? 0,
    // Older links have no l or c, which reads as none rather than failing.
    likely: products ? 0 : (count(params.l) ?? 0),
    critical: products ? 0 : (count(params.c) ?? 0),
    checked,
    products,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
  };
}

/** The share link's query string. The results page and the share page both build it here so they cannot drift. */
export function sharedQuery(result: SharedResult): string {
  const params = new URLSearchParams({ e: String(result.exploited), m: String(result.malicious) });
  if (!result.products) {
    params.set("l", String(result.likely));
    params.set("c", String(result.critical));
  }
  params.set("n", String(result.checked));
  if (result.products) params.set("t", "products");
  if (result.date) params.set("d", result.date);
  return params.toString();
}

function serious(result: SharedResult): number {
  return result.likely + result.critical;
}

/** The parts that are present, as "a", "a and b" or "a, b and c". */
function list(parts: (string | null)[]): string {
  const present = parts.filter((part): part is string => Boolean(part));
  return present.length > 1 ? `${present.slice(0, -1).join(", ")} and ${present.at(-1)}` : (present[0] ?? "");
}

/** "2 are likely to be exploited soon and 1 is rated critical": the results page and the share page say it the same way. */
export function seriousSplit(likely: number, critical: number): string {
  return list([
    likely ? `${likely} ${likely === 1 ? "is" : "are"} likely to be exploited soon` : null,
    critical ? `${critical} ${critical === 1 ? "is" : "are"} rated critical` : null,
  ]);
}

export function sharedLevel(result: SharedResult): SharedLevel {
  if (result.products) return result.exploited ? "reported" : "safe";
  if (result.exploited || result.malicious) return "confirmed";
  return serious(result) ? "reported" : "safe";
}

/** "I checked 2 packages: 7 serious vulnerabilities found." */
export function sharedHeadline(result: SharedResult): string {
  if (result.products) {
    return result.exploited
      ? `I checked ${plural(result.checked, "product")} against CISA’s exploited list: ${result.exploited} ${result.exploited === 1 ? "has" : "have"} known exploited vulnerabilities.`
      : `I checked ${plural(result.checked, "product")} against CISA’s exploited list: none found.`;
  }
  const others = serious(result);
  // "Other" once an exploited or malicious finding leads the sentence.
  const kind = result.exploited || result.malicious ? "other serious" : "serious";
  const found = list([
    result.exploited ? plural(result.exploited, "actively exploited vulnerability", "actively exploited vulnerabilities") : null,
    result.malicious ? plural(result.malicious, "malicious package") : null,
    others ? plural(others, `${kind} vulnerability`, `${kind} vulnerabilities`) : null,
  ]);
  return found
    ? `I checked ${plural(result.checked, "package")}: ${found} found.`
    : `I checked ${plural(result.checked, "package")} for exploited vulnerabilities and malware: 0 found.`;
}

export function sharedDetail(result: SharedResult): string {
  const when = result.date ? ` on ${longDate(`${result.date}T00:00:00Z`)}` : "";
  if (result.products) return `Checked against CISA’s Known Exploited Vulnerabilities catalogue${when}. Name matching, not a version check.`;
  // Say what "serious" means, so a reader sees the same split as the results page.
  const split = seriousSplit(result.likely, result.critical);
  const lead = split ? `${split.charAt(0).toUpperCase()}${split.slice(1)}${result.exploited ? "" : ", none known to be exploited yet"}. ` : "";
  return `${lead}Checked against the OSV database, CISA’s Known Exploited Vulnerabilities catalogue and FIRST EPSS${when}.`;
}
