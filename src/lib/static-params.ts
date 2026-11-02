import "server-only";

import { countriesWithIncidents, newestFirst } from "@/lib/og/select";
import { getPatchList } from "@/lib/patch";
import { getSnapshot } from "@/lib/snapshot";

// Cache Components needs at least one param per dynamic route to prerender it. These are the pages people
// open most, built ahead of time; any other URL gets its shell instantly and is cached after its first visit.

export async function cveParams(limit = 24): Promise<{ id: string }[]> {
  const [patch, snapshot] = await Promise.all([getPatchList().catch(() => []), getSnapshot()]);
  const ids = [...new Set([...patch.map((item) => item.cves[0]), ...snapshot.trending.map((vuln) => vuln.cve)])].slice(0, limit);
  return (ids.length ? ids : ["CVE-2021-44228"]).map((id) => ({ id }));
}

export async function incidentParams(limit = 24): Promise<{ id: string }[]> {
  const ids = newestFirst((await getSnapshot()).incidents)
    .slice(0, limit)
    .map((incident) => incident.id);
  // An empty picture still needs one entry; it renders the "no longer on the map" page.
  return (ids.length ? ids : ["none"]).map((id) => ({ id }));
}

export async function countryParams(): Promise<{ code: string }[]> {
  const codes = countriesWithIncidents(await getSnapshot());
  return (codes.length ? codes : ["US"]).map((code) => ({ code }));
}
