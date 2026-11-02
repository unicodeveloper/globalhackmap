import "server-only";

import { getKevCatalog } from "@/lib/sources/vulns";
import type { Vuln } from "@/lib/types";

/**
 * The full CISA KEV catalogue keyed by CVE, or null when CISA did not answer.
 * With null, no page may say a CVE is "not on CISA's list": the honest answer is "unknown".
 */
export async function kevIndex(): Promise<Map<string, Vuln> | null> {
  const catalog = await getKevCatalog().catch(() => null);
  return catalog?.length ? new Map(catalog.map((vuln) => [vuln.cve, vuln])) : null;
}

/** Overlay the catalogue's KEV fields, which are authoritative over a snapshot built while CISA was down. */
export function withKev(vuln: Vuln, kev: Map<string, Vuln> | null): Vuln {
  const entry = kev?.get(vuln.cve);
  return entry ? { ...vuln, kev: true, kevAdded: entry.kevAdded, kevDue: entry.kevDue, ransomware: entry.ransomware } : vuln;
}
