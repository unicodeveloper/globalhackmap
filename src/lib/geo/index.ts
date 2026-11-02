import "server-only";

import citiesData from "@/data/geo/cities.json";
import countriesData from "@/data/geo/countries.json";
import usStatesData from "@/data/geo/us-states.json";

/** [name, asciiName, iso2, admin1, lat, lon, population] from GeoNames cities15000 (CC BY 4.0). */
type CityRow = [string, string, string, string, number, number, number];

export interface CountryInfo {
  name: string;
  lat: number;
  lon: number;
  continent: string;
  tld: string;
}

export interface GeoPoint {
  lat: number;
  lon: number;
  city?: string;
  country: string;
}

const cities = citiesData as CityRow[];
export const countries = countriesData as Record<string, CountryInfo>;
const usStates = usStatesData as Record<string, string>;

export function normalizePlace(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(city of|city|municipality of|prefecture|ku)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

let cityIndex: Map<string, CityRow[]> | null = null;

function getCityIndex(): Map<string, CityRow[]> {
  if (cityIndex) return cityIndex;
  const index = new Map<string, CityRow[]>();
  for (const row of cities) {
    for (const key of new Set([normalizePlace(row[0]), normalizePlace(row[1] || row[0])])) {
      if (!key) continue;
      const list = index.get(key);
      if (list) list.push(row);
      else index.set(key, [row]);
    }
  }
  cityIndex = index;
  return index;
}

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "US",
  "united states of america": "US",
  us: "US",
  america: "US",
  uk: "GB",
  "united kingdom": "GB",
  britain: "GB",
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  "south korea": "KR",
  korea: "KR",
  "republic of korea": "KR",
  "north korea": "KP",
  russia: "RU",
  "russian federation": "RU",
  "czech republic": "CZ",
  czechia: "CZ",
  uae: "AE",
  "united arab emirates": "AE",
  "hong kong": "HK",
  taiwan: "TW",
  vietnam: "VN",
  "viet nam": "VN",
  iran: "IR",
  syria: "SY",
  turkey: "TR",
  turkiye: "TR",
  holland: "NL",
  netherlands: "NL",
  "the netherlands": "NL",
  "ivory coast": "CI",
};

let countryNameIndex: Map<string, string> | null = null;

export function countryCode(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    if (upper === "UK") return "GB";
    return countries[upper] ? upper : undefined;
  }
  if (!countryNameIndex) {
    countryNameIndex = new Map(Object.entries(countries).map(([iso, c]) => [normalizePlace(c.name), iso]));
  }
  const key = normalizePlace(trimmed);
  return COUNTRY_ALIASES[key] ?? countryNameIndex.get(key);
}

export function countryName(iso?: string): string {
  if (!iso) return "Unknown";
  return countries[iso]?.name ?? iso;
}

/** Resolve a city name to the most populous GeoNames match, optionally within a country or US state. */
export function resolveCity(city: string, country?: string, admin1?: string): GeoPoint | undefined {
  const key = normalizePlace(city.split(",")[0]);
  if (!key || key.length < 2) return undefined;
  const matches = getCityIndex().get(key);
  if (!matches?.length) return undefined;
  let pool = country ? matches.filter((row) => row[2] === country) : matches;
  if (admin1 && pool.length > 1) {
    const inState = pool.filter((row) => row[3] === admin1);
    if (inState.length) pool = inState;
  }
  const best = pool[0];
  if (!best) return undefined;
  return { lat: best[4], lon: best[5], city: best[0], country: best[2] };
}

/** Nearest GeoNames city (by great-circle distance) to a coordinate, optionally within a country. */
export function nearestCity(lat: number, lon: number, country?: string, maxKm = 60): GeoPoint | undefined {
  const toRad = Math.PI / 180;
  let best: CityRow | undefined;
  let bestKm = Infinity;
  for (const row of cities) {
    if (country && row[2] !== country) continue;
    if (Math.abs(row[4] - lat) > 1.5) continue;
    const dLat = (row[4] - lat) * toRad;
    const dLon = (row[5] - lon) * toRad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * toRad) * Math.cos(row[4] * toRad) * Math.sin(dLon / 2) ** 2;
    const km = 12_742 * Math.asin(Math.sqrt(a));
    // Prefer the bigger city when two are about equally close (wards vs the city itself).
    const weighted = km - Math.log10(Math.max(row[6], 10)) * 2;
    if (weighted < bestKm) {
      bestKm = weighted;
      best = row;
    }
  }
  if (!best || bestKm > maxKm) return undefined;
  return { lat: best[4], lon: best[5], city: best[0], country: best[2] };
}

/** Parse "Secaucus, NJ" style SEC business locations. */
export function resolveUsLocation(location: string): GeoPoint | undefined {
  const [cityPart, statePart] = location.split(",").map((part) => part.trim());
  if (!cityPart) return undefined;
  const state = statePart?.toUpperCase();
  if (state && !usStates[state]) {
    const iso = countryCode(statePart);
    return iso ? (resolveCity(cityPart, iso) ?? countryPoint(iso)) : undefined;
  }
  return resolveCity(cityPart, "US", state) ?? countryPoint("US");
}

export function countryPoint(iso: string): GeoPoint | undefined {
  const info = countries[iso];
  if (!info) return undefined;
  return { lat: info.lat, lon: info.lon, country: iso };
}

const GENERIC_TLDS = new Set(["com", "org", "net", "io", "ai", "co", "info", "biz", "app", "dev", "tv", "me", "gov", "edu", "mil", "int"]);

/** Country hint from a ccTLD, e.g. "sepiver.com.mx" -> MX. Generic TLDs return undefined. */
export function countryFromDomain(domain?: string): string | undefined {
  if (!domain) return undefined;
  const host = domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  const tld = host.split(".").pop();
  if (!tld || GENERIC_TLDS.has(tld)) return undefined;
  if (tld === "uk") return "GB";
  const iso = tld.toUpperCase();
  return countries[iso] ? iso : undefined;
}

/** Deterministic offset so pins in the same city do not stack exactly. */
export function jitter(id: string, lat: number, lon: number, spread = 0.06): [number, number] {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const angle = ((hash >>> 0) % 360) * (Math.PI / 180);
  const radius = (((hash >>> 9) % 1000) / 1000) * spread;
  return [lat + Math.sin(angle) * radius, lon + Math.cos(angle) * radius];
}

/**
 * True when the city only appears as a news dateline ("NEW DELHI:" or "TOKYO (Reuters) -"),
 * which says where the reporter was, not where the victim is.
 */
export function isDatelineOnly(city: string, text?: string): boolean {
  if (!text) return false;
  const name = city.trim().toLowerCase();
  if (!name) return false;
  const body = text.toLowerCase();
  const first = body.indexOf(name);
  if (first === -1) return false;
  const lineStart = body.lastIndexOf("\n", first) + 1;
  const prefix = body.slice(lineStart, first).replace(/[*_#>\s]/g, "");
  const after = body.slice(first + name.length, first + name.length + 24);
  const looksLikeDateline = prefix === "" && /^\s*[*_]*\s*(:|\(|,\s*[a-z.]+\s*\d|\s[-–]\s)/.test(after);
  const mentionedAgain = body.indexOf(name, first + name.length) !== -1;
  return looksLikeDateline && !mentionedAgain;
}
