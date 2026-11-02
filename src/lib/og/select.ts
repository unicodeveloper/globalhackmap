import type { Incident, Snapshot } from "@/lib/types";

const DAY = 86_400_000;

export function withinDays<T extends { date: string }>(items: T[], days: number, now = Date.now()): T[] {
  return items.filter((item) => now - Date.parse(item.date) < days * DAY);
}

export function newestFirst(incidents: Incident[]): Incident[] {
  return [...incidents].sort((a, b) => b.date.localeCompare(a.date));
}

/** Same actor or a shared CVE, as on the live map. */
export function relatedIncidents(snapshot: Snapshot, incident: Incident): Incident[] {
  const actor = incident.actor?.toLowerCase();
  return newestFirst(
    snapshot.incidents.filter(
      (other) => other.id !== incident.id && ((actor && other.actor?.toLowerCase() === actor) || other.cves.some((cve) => incident.cves.includes(cve))),
    ),
  );
}

export function cveMentions(snapshot: Snapshot, cve: string): Incident[] {
  return newestFirst(snapshot.incidents.filter((incident) => incident.cves.includes(cve)));
}

export function countryIncidents(snapshot: Snapshot, code: string): Incident[] {
  return newestFirst(snapshot.incidents.filter((incident) => incident.country === code));
}

export function countriesWithIncidents(snapshot: Snapshot): string[] {
  return [...new Set(snapshot.incidents.map((incident) => incident.country))].filter((code) => /^[A-Z]{2}$/.test(code));
}

export function isInSnapshot(snapshot: Snapshot, cve: string): boolean {
  return snapshot.trending.some((vuln) => vuln.cve === cve) || snapshot.kev.some((vuln) => vuln.cve === cve);
}
