import "server-only";

import type { ProductFinding, ProductMatch, StackProduct } from "@/lib/stack/types";
import type { Vuln } from "@/lib/types";

const STOP = new Set(["the", "and", "of", "for", "a", "an", "inc", "ltd", "llc", "corp", "corporation", "software", "version", "edition"]);

/**
 * Words that name a kind of thing rather than a product. A query made only of these ("Server", "OS", "Networks")
 * would match half the catalogue, so it never matches on its own.
 */
const GENERIC = new Set([
  "agent",
  "api",
  "app",
  "application",
  "appliance",
  "client",
  "cloud",
  "console",
  "core",
  "desktop",
  "device",
  "devices",
  "enterprise",
  "firmware",
  "framework",
  "gateway",
  "gateways",
  "group",
  "manager",
  "management",
  "mobile",
  "multiple",
  "network",
  "networks",
  "os",
  "platform",
  "plugin",
  "portal",
  "products",
  "secure",
  "security",
  "server",
  "service",
  "services",
  "suite",
  "system",
  "systems",
  "technologies",
  "web",
]);

/**
 * Marketing names people type that CISA files under another product name.
 * Only mappings that are one-to-one and well established.
 */
const ALIASES: Record<string, string> = {
  fortigate: "fortios",
  "fortinet fortigate": "fortinet fortios",
  "pulse secure": "ivanti connect secure",
  "pulse connect secure": "ivanti connect secure",
  globalprotect: "pan-os",
  "palo alto globalprotect": "pan-os",
};

const MAX_MATCHES = 6;
const MAX_NEWS = 3;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0 && !STOP.has(word));
}

function queryWords(name: string): string[] {
  const key = name.toLowerCase().replace(/\s+/g, " ").trim();
  return words(ALIASES[key] ?? key);
}

/** True when `phrase` appears in `tokens` as whole, consecutive words ("connect secure" in "ivanti connect secure"). */
function hasPhrase(tokens: string[], phrase: string[]): boolean {
  if (!phrase.length || phrase.length > tokens.length) return false;
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    if (phrase.every((word, offset) => tokens[i + offset] === word)) return true;
  }
  return false;
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((word, index) => word === b[index]);
}

function startsWith(tokens: string[], phrase: string[]): boolean {
  return phrase.length > 0 && phrase.length <= tokens.length && phrase.every((word, index) => tokens[index] === word);
}

/** Specific enough to stand alone: at least one word that is not a generic label and is not a two-letter stub. */
function distinctive(tokens: string[]): boolean {
  return tokens.some((word) => word.length >= 3 && !GENERIC.has(word));
}

/**
 * How an entry relates to what was typed.
 * product: one of the products it lists is what was typed ("PHP" and PHP Group's "PHP").
 * vendor: the query is only its vendor ("WordPress" and WordPress's "Core").
 * partial: what was typed starts one of its product names ("Exchange" and "Exchange Server").
 * described: a "Multiple Products" entry whose description names what was typed.
 * Confirmed means the vendor is not in doubt: the query named it, or the description names the product right after it.
 */
type Relation = "product" | "vendor" | "partial" | "described";

interface Related {
  relation: Relation;
  confirmed: boolean;
}

interface Hit extends Related {
  vuln: Vuln;
  vendor: string;
}

/**
 * Compare a query with an entry's vendor and product fields only, as whole words. The vulnerability name and
 * description say what an attacker can do ("...PHP External Variable Modification") and are not evidence of which
 * product it is, so they are never matched, apart from CISA's "Multiple Products" entries described above.
 */
function relate(query: string[], vuln: Pick<Vuln, "vendor" | "product" | "description">): Related | null {
  if (!distinctive(query)) return null;
  const vendor = words(vuln.vendor);
  const product = words(vuln.product);
  // The query with the vendor's words taken out: "Fortinet FortiOS" leaves "fortios" to compare with the product.
  const named = query.some((word) => vendor.includes(word) && word.length >= 3 && !GENERIC.has(word));
  const rest = named ? query.filter((word) => !vendor.includes(word)) : query;

  if (/^\s*multiple\b/i.test(vuln.product)) {
    if (named && !rest.length) return { relation: "vendor", confirmed: true };
    if (!distinctive(rest)) return null;
    const described = words(vuln.description);
    if (!hasPhrase(described, rest)) return null;
    return { relation: "described", confirmed: named || hasPhrase(described, [...vendor, ...rest]) };
  }

  // A product field can list several products: "Connect Secure, Policy Secure, and ZTA Gateways".
  const names = vuln.product
    .split(/,|&|\/|\(|\)|\band\b/i)
    .map(words)
    .filter((name) => name.length);
  // "Exchange Server" is still Exchange when CISA files it as "Exchange", so also try without generic words.
  const core = rest.filter((word) => !GENERIC.has(word));
  const candidates = [query, rest, distinctive(core) ? core : []].filter((candidate) => candidate.length);
  if (candidates.some((candidate) => same(product, candidate) || names.some((name) => same(name, candidate)))) {
    return { relation: "product", confirmed: true };
  }
  if (named && !rest.length) {
    // A product named after the vendor plus more letters is a different product: PHPMailer is filed under vendor "PHP".
    const offshoot = product.some((word) => query.some((typed) => word !== typed && word.startsWith(typed)));
    return offshoot ? null : { relation: "vendor", confirmed: true };
  }
  // With the vendor confirmed the words can sit anywhere in a name ("Pulse Connect Secure"). Without it they
  // must start one, so "Exchange" finds "Exchange Server" but not "Internet Key Exchange".
  const within = named ? hasPhrase : startsWith;
  if ([query, rest].some((candidate) => distinctive(candidate) && names.some((name) => within(name, candidate)))) {
    return { relation: "partial", confirmed: named };
  }
  return null;
}

/**
 * Exact product matches always count. Everything looser must agree with them. Without exact matches, entries
 * filed under the vendor typed ("WordPress") set the identity instead. So an unconfirmed partial match from
 * another vendor is dropped (WebPros' "cPanel & WHM and WP2 (WordPress Squared)" for "WordPress"), while one
 * from the same vendor stays (Microsoft's "Windows Ancillary Function Driver for WinSock" for "Windows").
 */
function select(hits: Hit[]): Set<Vuln> {
  const exact = hits.filter((hit) => hit.relation === "product");
  const anchor = new Set((exact.length ? exact : hits.filter((hit) => hit.relation === "vendor")).map((hit) => hit.vendor));
  const keep = (hit: Hit) => {
    if (hit.relation === "product" || hit.relation === "vendor") return anchor.has(hit.vendor);
    if (hit.confirmed) return true;
    // A loose match with nothing stronger to check it against is kept only if it rests on the product field.
    return anchor.size ? anchor.has(hit.vendor) : hit.relation === "partial";
  };
  return new Set(hits.filter(keep).map((hit) => hit.vuln));
}

function toMatch(vuln: Vuln): ProductMatch {
  return {
    cve: vuln.cve,
    vendor: vuln.vendor,
    product: vuln.product,
    name: vuln.name,
    kev: vuln.kev,
    added: vuln.kevAdded,
    due: vuln.kevDue,
    ransomware: vuln.ransomware,
    epss: vuln.epss,
    advisory: vuln.references.find((ref) => /^https?:\/\//.test(ref)),
  };
}

/**
 * Free-text products ("FortiGate 7.4") against CISA KEV and this week's news by vendor and product name.
 * This is name matching, not version matching: KEV and the news feed carry no affected-version ranges, so a
 * version someone typed cannot confirm or rule out exposure. A match means "check your version", not "affected".
 */
export function matchProducts(products: StackProduct[], kev: Vuln[], trending: Vuln[]): ProductFinding[] {
  const kevIds = new Set(kev.map((vuln) => vuln.cve));
  const newsOnly = trending.filter((vuln) => !vuln.kev && !kevIds.has(vuln.cve));
  const pool = [...kev, ...newsOnly];
  return products.map((product) => {
    const query = queryWords(product.name);
    const hits: Hit[] = [];
    for (const vuln of pool) {
      const related = relate(query, vuln);
      if (related) hits.push({ ...related, vuln, vendor: words(vuln.vendor).join(" ") });
    }
    // One identity across the catalogue and the news, so a loose news match cannot sneak past a strong KEV one.
    const kept = select(hits);
    const matched = kev.filter((vuln) => kept.has(vuln)).sort((a, b) => (b.kevAdded ?? "").localeCompare(a.kevAdded ?? ""));
    const news = newsOnly.filter((vuln) => kept.has(vuln)).slice(0, MAX_NEWS);
    return {
      name: product.name,
      ...(product.version ? { version: product.version } : {}),
      kevTotal: matched.length,
      matches: matched.slice(0, MAX_MATCHES).map(toMatch),
      news: news.map(toMatch),
    };
  });
}

/** Products with at least one KEV match. The verdict counts these, so only real matches can raise it. */
export function productsExploited(products: ProductFinding[]): number {
  return products.filter((product) => product.kevTotal > 0).length;
}
