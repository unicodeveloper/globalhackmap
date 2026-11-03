import type { Incident, IncidentStatus } from "./types";

export const INCIDENT_STATUSES = ["confirmed", "reported", "claimed", "precautionary", "disputed"] as const;
const DAY = 86_400_000;

export interface IncidentSummary {
  organisations: number;
  availableOrganisations: number;
  incidentCount: number;
  statusCounts: Record<IncidentStatus, number>;
  filtered: boolean;
}

export interface IncidentDay {
  date: number;
  total: number;
}

function domainOf(incident: Incident): string | undefined {
  const raw = incident.domain?.trim();
  if (!raw) return;
  try {
    const host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\.$/, "");
    return host.includes(".") ? host : undefined;
  } catch {
    return;
  }
}

/** Prefer the recorded domain; join a missing domain by name/country only when unambiguous. */
function organisationKeys(incidents: Incident[]): Map<Incident, string> {
  const nameOf = (incident: Incident) => `${incident.country.toUpperCase()}:${incident.victim.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")}`;
  const domains = new Map<string, Set<string>>();
  for (const incident of incidents) {
    const domain = domainOf(incident);
    if (!domain || !incident.victim.trim()) continue;
    const name = nameOf(incident);
    const found = domains.get(name) ?? new Set<string>();
    found.add(domain);
    domains.set(name, found);
  }
  return new Map(
    incidents.map((incident) => {
      const name = nameOf(incident);
      const candidates = incident.victim.trim() ? domains.get(name) : undefined;
      const domain = domainOf(incident) ?? (candidates?.size === 1 ? [...candidates][0] : undefined);
      return [incident, domain ? `domain:${domain}` : incident.victim.trim() ? `name:${name}` : `incident:${incident.id}`];
    }),
  );
}

/** One scope and identity definition for the map, feed, headline, status counts and daily bars. */
export function incidentView(incidents: Incident[], options: { now: number; windowMs: number; country: string | null; statuses: ReadonlySet<IncidentStatus> }) {
  const { now, windowMs, country, statuses } = options;
  const available = incidents.filter((incident) => {
    const date = Date.parse(incident.date);
    return Number.isFinite(date) && date <= now && (!country || incident.country === country);
  });
  const keys = organisationKeys(available);
  const distinct = (items: Incident[]) => new Set(items.map((incident) => keys.get(incident))).size;
  const scoped = available.filter((incident) => now - Date.parse(incident.date) < windowMs);
  const visible = scoped.filter((incident) => statuses.has(incident.status));
  const statusCounts: Record<IncidentStatus, number> = { confirmed: 0, reported: 0, claimed: 0, precautionary: 0, disputed: 0 };
  for (const status of INCIDENT_STATUSES) statusCounts[status] = distinct(scoped.filter((incident) => incident.status === status));

  const bins = Array.from({ length: 14 }, () => new Set<string>());
  for (const incident of available) {
    if (!statuses.has(incident.status)) continue;
    const age = Math.floor((now - Date.parse(incident.date)) / DAY);
    if (age < bins.length) bins[bins.length - 1 - age].add(keys.get(incident)!);
  }
  const days: IncidentDay[] = bins.map((organisations, index) => ({ date: now - (13 - index) * DAY, total: organisations.size }));
  const summary: IncidentSummary = {
    organisations: distinct(visible),
    availableOrganisations: distinct(scoped),
    incidentCount: visible.length,
    statusCounts,
    filtered: INCIDENT_STATUSES.some((status) => !statuses.has(status)),
  };
  return { incidents: visible, summary, days };
}
